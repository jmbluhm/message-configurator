// Load environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';
const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse cookies
app.use(cookieParser());

// Parse JSON bodies
app.use(express.json());

// Authentication middleware
function requireAuth(req, res, next) {
  // Allow /api/auth endpoint without authentication
  if (req.path === '/api/auth') {
    return next();
  }
  
  // Check if user is authenticated via cookie
  const authCookie = req.cookies.authenticated;
  if (authCookie === 'true') {
    return next();
  }
  
  // If requesting an API endpoint, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // For static files, serve a simple HTML page that redirects to password prompt
  // This will be handled by the frontend
  return next();
}

// Authentication endpoint
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  
  if (!ACCESS_PASSWORD) {
    return res.status(500).json({ error: 'Access password not configured' });
  }
  
  if (password === ACCESS_PASSWORD) {
    // Set authenticated cookie
    // httpOnly: true for security, secure: true in production (HTTPS only)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('authenticated', 'true', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return res.json({ success: true });
  } else {
    return res.status(401).json({ error: 'Invalid password' });
  }
});

// Apply authentication middleware before serving static files
app.use(requireAuth);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store conversation state per conversation ID (in-memory, resets on server restart)
const conversationCache = new Map(); // conversationId -> { messages: [], currentIndex: 0 }

// Parse system actions with bracket syntax: [Action 1, with comma],[Action 2]
// Commas inside brackets are preserved, commas outside brackets separate actions
function parseSystemActions(systemActionsString) {
  if (!systemActionsString || !systemActionsString.trim()) {
    return [];
  }
  
  const actions = [];
  let currentAction = '';
  let bracketDepth = 0;
  let i = 0;
  
  while (i < systemActionsString.length) {
    const char = systemActionsString[i];
    
    if (char === '[') {
      bracketDepth++;
      currentAction += char;
    } else if (char === ']') {
      bracketDepth--;
      currentAction += char;
    } else if (char === ',' && bracketDepth === 0) {
      // This comma is outside brackets, so it separates actions
      const trimmed = currentAction.trim();
      if (trimmed) {
        actions.push(trimmed);
      }
      currentAction = '';
    } else {
      currentAction += char;
    }
    
    i++;
  }
  
  // Add the last action
  const trimmed = currentAction.trim();
  if (trimmed) {
    actions.push(trimmed);
  }
  
  return actions.filter(action => action.length > 0);
}

// Format system actions array back to string with bracket syntax
function formatSystemActions(actions) {
  if (!actions || actions.length === 0) {
    return '';
  }
  
  // If an action doesn't already have brackets, wrap it
  return actions.map(action => {
    const trimmed = action.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed;
    }
    return `[${trimmed}]`;
  }).join(',');
}

async function loadConversation(conversationId) {
  try {
    // Load messages
    const { data: messagesData, error: messagesError } = await supabase
      .from('conversation_message')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('turn', { ascending: true });
    
    if (messagesError) {
      throw messagesError;
    }
    
    // Load actions for all messages
    const messageIds = (messagesData || []).map(msg => msg.id);
    let actionsData = [];
    
    if (messageIds.length > 0) {
      const { data: actions, error: actionsError } = await supabase
        .from('message_actions')
        .select('*')
        .in('conversation_message_id', messageIds)
        .order('created_at', { ascending: true });
      
      if (actionsError) {
        throw actionsError;
      }
      
      actionsData = actions || [];
    }
    
    // Group actions by message ID
    const actionsByMessageId = {};
    actionsData.forEach(action => {
      if (!actionsByMessageId[action.conversation_message_id]) {
        actionsByMessageId[action.conversation_message_id] = [];
      }
      actionsByMessageId[action.conversation_message_id].push({
        id: action.id,
        content: action.action_content
      });
    });
    
    // Convert database rows to conversation format
    const messages = (messagesData || [])
      .filter(row => row.speaker && row.message) // Filter out empty/invalid rows
      .map(row => ({
        id: row.id, // Include message ID for action association
        speaker: row.speaker,
        message: row.message || '',
        actions: actionsByMessageId[row.id] || [] // Actions for this message
      }));
    
    // Cache the conversation
    conversationCache.set(conversationId, {
      messages: messages,
      currentIndex: 0
    });
    
    return messages;
  } catch (error) {
    throw error;
  }
}

function getConversationState(conversationId) {
  if (!conversationCache.has(conversationId)) {
    conversationCache.set(conversationId, {
      messages: [],
      currentIndex: 0
    });
  }
  return conversationCache.get(conversationId);
}

// API endpoint to list all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversation')
      .select('id, name, created_at, updated_at')
      .order('updated_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// API endpoint to create a new conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Conversation name is required' });
    }
    
    const { data, error } = await supabase
      .from('conversation')
      .insert({ name: name.trim() })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    // Initialize empty conversation state
    conversationCache.set(data.id, {
      messages: [],
      currentIndex: 0
    });
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// API endpoint to get next message
app.post('/api/next-message', async (req, res) => {
  try {
    const { conversationId } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    
    const state = getConversationState(conversationId);
    
    // Load conversation if not cached or empty
    if (state.messages.length === 0) {
      await loadConversation(conversationId);
      // Reload state after loading
      const updatedState = getConversationState(conversationId);
      state.messages = updatedState.messages;
      state.currentIndex = 0;
    }
    
    const conversation = state.messages;
    const currentIndex = state.currentIndex;
    
    // Find the next AI Agent message
    let nextAIMessage = null;
    let nextMerchantMessage = null;
    let aiIndex = -1;
    let merchantIndex = -1;
    let systemActions = [];

    // Start searching from currentIndex
    for (let i = currentIndex; i < conversation.length; i++) {
      if (conversation[i].speaker === 'AI Agent' && nextAIMessage === null) {
        nextAIMessage = conversation[i].message;
        // Extract action contents for backward compatibility
        systemActions = (conversation[i].actions || []).map(a => a.content);
        aiIndex = i;
        break;
      }
    }

    // Find the next Merchant message after the AI message
    if (aiIndex >= 0) {
      for (let i = aiIndex + 1; i < conversation.length; i++) {
        if (conversation[i].speaker === 'Merchant') {
          nextMerchantMessage = conversation[i].message;
          merchantIndex = i;
          break;
        }
      }
    }

    // Update currentIndex to point after the AI message we just returned
    if (aiIndex >= 0) {
      state.currentIndex = aiIndex + 1;
    }

    // Return response
    res.json({
      aiMessage: nextAIMessage,
      merchantMessage: nextMerchantMessage,
      systemActions: systemActions,
      hasMore: state.currentIndex < conversation.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get next message' });
  }
});

// Reset conversation endpoint
app.post('/api/reset', (req, res) => {
  try {
    const { conversationId } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    
    const state = getConversationState(conversationId);
    state.currentIndex = 0;
    
    res.json({ message: 'Conversation reset' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset conversation' });
  }
});

// Get conversation messages
app.get('/api/conversation', async (req, res) => {
  try {
    const conversationId = req.query.conversationId;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId query parameter is required' });
    }
    
    const state = getConversationState(conversationId);
    
    // Load conversation if not cached or empty
    if (state.messages.length === 0) {
      await loadConversation(conversationId);
      // Reload state after loading
      const updatedState = getConversationState(conversationId);
      state.messages = updatedState.messages;
    }
    
    // Return conversation as array for frontend editing
    // Include message IDs and actions for each message
    const conversationData = state.messages.map((msg, index) => ({
      id: msg.id, // Include message ID
      turn: index + 1,
      speaker: msg.speaker,
      message: msg.message,
      actions: msg.actions || [] // Include actions array with id and content
    }));
    
    res.json(conversationData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Save conversation to database
app.post('/api/conversation', async (req, res) => {
  try {
    const { conversationId, conversationData } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    
    if (!conversationData || !Array.isArray(conversationData)) {
      return res.status(400).json({ error: 'conversationData array is required' });
    }
    
    // Get all existing message IDs for this conversation to delete actions
    const { data: existingMessages, error: existingError } = await supabase
      .from('conversation_message')
      .select('id')
      .eq('conversation_id', conversationId);
    
    if (existingError) {
      throw existingError;
    }
    
    const existingMessageIds = (existingMessages || []).map(m => m.id);
    
    // Delete all existing message_actions for these messages
    if (existingMessageIds.length > 0) {
      const { error: deleteActionsError } = await supabase
        .from('message_actions')
        .delete()
        .in('conversation_message_id', existingMessageIds);
      
      if (deleteActionsError) {
        throw deleteActionsError;
      }
    }
    
    // Prepare data for database
    const dbData = conversationData.map(row => ({
      conversation_id: conversationId,
      turn: parseInt(row.turn) || null,
      speaker: row.speaker || '',
      message: row.message || ''
    }));
    
    // Delete all existing records for this conversation and insert new ones
    const { error: deleteError } = await supabase
      .from('conversation_message')
      .delete()
      .eq('conversation_id', conversationId);
    
    if (deleteError) {
      throw deleteError;
    }
    
    // Insert new records (only if there's data to insert)
    let insertedMessages = [];
    if (dbData.length > 0) {
      const { data, error: insertError } = await supabase
        .from('conversation_message')
        .insert(dbData)
        .select();
      
      if (insertError) {
        throw insertError;
      }
      
      insertedMessages = data || [];
    }
    
    // Insert actions for each message
    const actionsToInsert = [];
    conversationData.forEach((row, index) => {
      const messageId = insertedMessages[index]?.id;
      if (!messageId) return;
      
      // Support new format: actions array
      if (row.actions && Array.isArray(row.actions)) {
        row.actions.forEach(action => {
          // Support both new format (object with id/content) and legacy format (string)
          const actionContent = typeof action === 'string' ? action : (action.content || '');
          if (actionContent && actionContent.trim()) {
            actionsToInsert.push({
              conversation_message_id: messageId,
              action_content: actionContent.trim()
            });
          }
        });
      }
      // Backward compatibility: support old system_actions format
      else if (row.system_actions) {
        const parsedActions = parseSystemActions(row.system_actions);
        parsedActions.forEach(action => {
          // Strip brackets if present
          let actionContent = action.trim();
          if (actionContent.startsWith('[') && actionContent.endsWith(']')) {
            actionContent = actionContent.slice(1, -1);
          }
          if (actionContent && actionContent.trim()) {
            actionsToInsert.push({
              conversation_message_id: messageId,
              action_content: actionContent.trim()
            });
          }
        });
      }
    });
    
    // Insert all actions at once
    if (actionsToInsert.length > 0) {
      const { error: insertActionsError } = await supabase
        .from('message_actions')
        .insert(actionsToInsert);
      
      if (insertActionsError) {
        throw insertActionsError;
      }
    }
    
    // Update conversation updated_at timestamp
    await supabase
      .from('conversation')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    // Reload conversation and reset state
    await loadConversation(conversationId);
    const state = getConversationState(conversationId);
    state.currentIndex = 0;
    
    res.json({ message: 'Conversation saved successfully', count: dbData.length });
  } catch (error) {
    const errorMessage = error.message || 'Failed to save conversation';
    res.status(500).json({ error: `Failed to save conversation: ${errorMessage}` });
  }
});

// No need to load conversation on startup - will be loaded on demand

// Start server
app.listen(PORT, () => {
  // Server started
});
