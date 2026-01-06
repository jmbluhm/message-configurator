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
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
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

// Load conversation from database
let conversation = [];
let conversationLoaded = false;

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

async function loadConversation() {
  try {
    const { data, error } = await supabase
      .from('conversation')
      .select('*')
      .order('turn', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // Convert database rows to conversation format
    conversation = (data || [])
      .filter(row => row.speaker && row.message) // Filter out empty/invalid rows
      .map(row => ({
        speaker: row.speaker,
        message: row.message || '',
        systemActions: parseSystemActions(row.system_actions || '')
      }));
    
    conversationLoaded = true;
    console.log(`Loaded ${conversation.length} messages from database`);
  } catch (error) {
    console.error('Error loading conversation from database:', error);
    throw error;
  }
}

// Track conversation state (in-memory, resets on server restart)
let currentIndex = 0;

// API endpoint to get next message
app.post('/api/next-message', async (req, res) => {
  if (!conversationLoaded) {
    try {
      await loadConversation();
    } catch (error) {
      return res.status(500).json({ error: 'Failed to load conversation' });
    }
  }

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
      systemActions = conversation[i].systemActions || [];
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
    currentIndex = aiIndex + 1;
  }

  // Return response
  res.json({
    aiMessage: nextAIMessage,
    merchantMessage: nextMerchantMessage,
    systemActions: systemActions,
    hasMore: currentIndex < conversation.length
  });
});

// Reset conversation endpoint
app.post('/api/reset', (req, res) => {
  currentIndex = 0;
  res.json({ message: 'Conversation reset' });
});

// Get conversation CSV
app.get('/api/conversation', async (req, res) => {
  if (!conversationLoaded) {
    try {
      await loadConversation();
    } catch (error) {
      return res.status(500).json({ error: 'Failed to load conversation' });
    }
  }
  
  // Return conversation as array for frontend editing
  const conversationData = conversation.map((msg, index) => ({
    turn: index + 1,
    speaker: msg.speaker,
    message: msg.message,
    system_actions: formatSystemActions(msg.systemActions)
  }));
  
  res.json(conversationData);
});

// Save conversation to database
app.post('/api/conversation', async (req, res) => {
  try {
    const conversationData = req.body;
    
    // Prepare data for database
    // Parse and reformat system_actions to ensure proper bracket syntax
    const dbData = conversationData.map(row => {
      const systemActions = parseSystemActions(row.system_actions || '');
      return {
        turn: parseInt(row.turn) || null,
        speaker: row.speaker || '',
        message: row.message || '',
        system_actions: formatSystemActions(systemActions) || null
      };
    });
    
    // Delete all existing records and insert new ones
    // Using upsert with a unique constraint on turn would be better, but for simplicity
    // we'll delete and reinsert
    const { error: deleteError } = await supabase
      .from('conversation')
      .delete()
      .gte('id', 0); // Delete all records (gte 'id', 0 is always true)
    
    if (deleteError) {
      throw deleteError;
    }
    
    // Insert new records
    const { data, error: insertError } = await supabase
      .from('conversation')
      .insert(dbData)
      .select();
    
    if (insertError) {
      throw insertError;
    }
    
    // Reload conversation
    await loadConversation();
    currentIndex = 0; // Reset conversation state
    
    res.json({ message: 'Conversation saved successfully', count: dbData.length });
  } catch (error) {
    console.error('Error saving conversation:', error);
    const errorMessage = error.message || 'Failed to save conversation';
    res.status(500).json({ error: `Failed to save conversation: ${errorMessage}` });
  }
});

// Initialize: Load conversation on startup
loadConversation().catch(error => {
  console.error('Failed to load conversation on startup:', error);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
