const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const PORT = 3000;
const CSV_PATH = path.join(__dirname, 'conversation.csv');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON bodies
app.use(express.json());

// Load conversation from CSV
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

function loadConversation() {
  return new Promise((resolve, reject) => {
    conversation = [];
    const results = [];
    
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`CSV file not found: ${CSV_PATH}`);
      reject(new Error('CSV file not found'));
      return;
    }
    
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (data) => {
        results.push(data);
      })
      .on('end', () => {
        // Convert CSV rows to conversation format
        conversation = results
          .filter(row => row.speaker && row.message) // Filter out empty/invalid rows
          .map(row => ({
            speaker: row.speaker,
            message: (row.message || '').replace(/\\n/g, '\n'), // Convert \n to actual newlines
            systemActions: parseSystemActions(row.system_actions || '')
          }));
        
        conversationLoaded = true;
        console.log(`Loaded ${conversation.length} messages from CSV`);
        resolve();
      })
      .on('error', (error) => {
        console.error('Error reading CSV:', error);
        reject(error);
      });
  });
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

// Save conversation CSV
app.post('/api/conversation', async (req, res) => {
  try {
    const conversationData = req.body;
    
    // Convert to CSV format
    const csvWriter = createCsvWriter({
      path: CSV_PATH,
      header: [
        { id: 'turn', title: 'turn' },
        { id: 'speaker', title: 'speaker' },
        { id: 'message', title: 'message' },
        { id: 'system_actions', title: 'system_actions' }
      ]
    });
    
    // Prepare data for CSV (convert newlines to \n for CSV)
    // Parse and reformat system_actions to ensure proper bracket syntax
    const csvData = conversationData.map(row => {
      const systemActions = parseSystemActions(row.system_actions || '');
      return {
        turn: row.turn || '',
        speaker: row.speaker || '',
        message: (row.message || '').replace(/\n/g, '\\n'),
        system_actions: formatSystemActions(systemActions)
      };
    });
    
    await csvWriter.writeRecords(csvData);
    
    // Reload conversation
    await loadConversation();
    currentIndex = 0; // Reset conversation state
    
    res.json({ message: 'Conversation saved successfully', count: csvData.length });
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ error: 'Failed to save conversation' });
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
