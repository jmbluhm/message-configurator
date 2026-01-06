// Authentication elements
const passwordOverlay = document.getElementById('passwordOverlay');
const appContainer = document.getElementById('appContainer');
const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');

const chatMessages = document.getElementById('chatMessages');
const systemNotes = document.getElementById('systemNotes');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const autoFillIndicator = document.getElementById('autoFillIndicator');
const resetButton = document.getElementById('resetButton');

// Conversation management
let currentConversationId = null;
let conversations = [];

// Conversation UI elements - will be set after DOM loads
let conversationSelect = null;
let createConversationButton = null;
let createConversationModal = null;
let createConversationForm = null;
let newConversationName = null;
let cancelCreateConversation = null;
let createConversationError = null;

// Helper function to get conversation elements - query directly each time
function getConversationElement(id) {
  // Try multiple methods - be more aggressive
  let element = document.getElementById(id);
  
  if (!element) {
    // Try querySelector on document
    element = document.querySelector(`#${id}`);
  }
  
  if (!element) {
    // Try querying from appContainer
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      element = appContainer.querySelector(`#${id}`);
    }
  }
  
  if (!element) {
    // Try querying from body
    element = document.body.querySelector(`#${id}`);
  }
  
  if (!element) {
    // Last resort - try all elements with that ID
    const allElements = document.querySelectorAll(`[id="${id}"]`);
    if (allElements.length > 0) {
      element = allElements[0];
    }
  }
  
  return element;
}

// Initialize conversation UI elements - just set up handlers, query elements when needed
function initConversationElements() {
  // Try to find elements immediately
  conversationSelect = getConversationElement('conversationSelect');
  createConversationButton = getConversationElement('createConversationButton');
  
  console.log('Initialized conversation elements:', {
    conversationSelect: !!conversationSelect,
    createConversationButton: !!createConversationButton,
    appContainer: !!document.getElementById('appContainer'),
    appContainerDisplay: document.getElementById('appContainer')?.style.display,
    allSelects: document.querySelectorAll('select').length,
    allButtons: document.querySelectorAll('button').length
  });
  
  // Debug: log all elements in appContainer
  const appContainer = document.getElementById('appContainer');
  if (appContainer) {
    console.log('Elements in appContainer:', {
      selects: appContainer.querySelectorAll('select').length,
      buttons: appContainer.querySelectorAll('button').length,
      hasConversationSelect: !!appContainer.querySelector('#conversationSelect'),
      innerHTML: appContainer.querySelector('.app-header')?.innerHTML.substring(0, 200)
    });
  }
}

let isWaitingForResponse = false;
let systemActionCounter = 0;
let aiAgentMessageNumber = 0;
let conversationIndex = 0; // Track current position in conversationData
let currentlyEditingMessage = null; // Track which message is being edited
let currentlyEditingSystemAction = null; // Track which system action is being edited

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

// Auto-resize textarea function
function autoResizeTextarea(textarea) {
  if (!textarea) return;
  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto';
  // Set height to scrollHeight, but cap at max-height
  const scrollHeight = textarea.scrollHeight;
  const maxHeight = 300; // Match max-height from CSS
  textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
  // Show scrollbar if content exceeds max height
  textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

// Authentication functions
async function checkAuthentication() {
  try {
    // Try to access a protected endpoint to check if authenticated
    // Use conversations endpoint which doesn't require conversationId
    const response = await fetch('/api/conversations', {
      credentials: 'include'
    });
    
    if (response.ok || response.status === 200) {
      return true;
    } else if (response.status === 401) {
      return false;
    }
    // If there's an error, assume not authenticated
    return false;
  } catch (error) {
    // Network error or other issue - assume not authenticated
    return false;
  }
}

async function authenticate(password) {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
      credentials: 'include' // Include cookies
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return true;
      }
    }
    
    const errorData = await response.json();
    throw new Error(errorData.error || 'Authentication failed');
  } catch (error) {
    throw error;
  }
}

function showApp() {
  if (passwordOverlay) passwordOverlay.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';
}

function showPasswordPrompt() {
  if (passwordOverlay) passwordOverlay.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';
  if (passwordInput) passwordInput.focus();
}

// Handle password form submission
if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = passwordInput.value;
    if (!password) {
      return;
    }
    
    // Clear previous error
    if (passwordError) {
      passwordError.style.display = 'none';
      passwordError.textContent = '';
    }
    
    try {
      await authenticate(password);
      // Authentication successful
      showApp();
      // Initialize the app
      initializeApp();
    } catch (error) {
      // Show error message
      if (passwordError) {
        passwordError.textContent = error.message || 'Invalid password. Please try again.';
        passwordError.style.display = 'block';
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    }
  });
}

// Load all conversations
async function loadConversations() {
  try {
    console.log('Loading conversations...');
    const response = await fetch('/api/conversations', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to load conversations:', response.status, errorText);
      throw new Error(`Failed to load conversations: ${response.status}`);
    }
    
    conversations = await response.json();
    console.log('Loaded conversations:', conversations);
    
    // Force update dropdown - query element fresh
    updateConversationDropdown();
    
    // If there are conversations and none is selected, select the first one
    if (conversations.length > 0) {
      if (!currentConversationId) {
        currentConversationId = conversations[0].id;
        console.log('Auto-selecting first conversation:', currentConversationId);
      }
      
      // Query select element fresh and set value
      const select = getConversationElement('conversationSelect');
      if (select) {
        select.value = currentConversationId;
        console.log('Set select value to:', currentConversationId);
        // Load the conversation data
        console.log('Loading conversation data immediately');
        await loadConversationData();
      } else {
        console.warn('Select element not found yet, will be handled by createDropdownManually');
        // The createDropdownManually function will handle loading the conversation
      }
    } else if (conversations.length === 0) {
      console.warn('No conversations found. Create a new conversation to get started.');
      const select = getConversationElement('conversationSelect');
      if (select) {
        select.innerHTML = '<option value="">No conversations - Create one below</option>';
      }
    }
  } catch (error) {
    console.error('Error loading conversations:', error);
    const select = getConversationElement('conversationSelect');
    if (select) {
      select.innerHTML = `<option value="">Error: ${error.message}</option>`;
    }
  }
}

// Update conversation dropdown - with aggressive retry
function updateConversationDropdown() {
  // Try multiple methods to find the select element
  let select = document.getElementById('conversationSelect');
  
  if (!select) {
    // Try querySelector
    select = document.querySelector('#conversationSelect');
  }
  
  if (!select) {
    // Try from appContainer
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      select = appContainer.querySelector('#conversationSelect');
    }
  }
  
  if (!select) {
    // Try finding any select in the header
    const header = document.querySelector('.app-header');
    if (header) {
      select = header.querySelector('select');
    }
  }
  
  if (!select) {
    console.error('conversationSelect element not found after all attempts');
    console.log('Debug info:', {
      allSelects: Array.from(document.querySelectorAll('select')).map(s => ({ id: s.id, className: s.className })),
      appContainer: !!document.getElementById('appContainer'),
      header: !!document.querySelector('.app-header'),
      headerHTML: document.querySelector('.app-header')?.innerHTML.substring(0, 500)
    });
    
    // Aggressive retry - try multiple times with increasing delays
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = setInterval(() => {
      retryCount++;
      select = document.getElementById('conversationSelect') || 
               document.querySelector('#conversationSelect') ||
               document.querySelector('.app-header select');
      
      if (select) {
        clearInterval(retryInterval);
        console.log('Found conversationSelect on retry', retryCount);
        conversationSelect = select;
        updateConversationDropdown();
      } else if (retryCount >= maxRetries) {
        clearInterval(retryInterval);
        console.error('conversationSelect not found after', maxRetries, 'retries');
        // Create the dropdown manually if it doesn't exist
        createDropdownManually();
      }
    }, 300);
    return;
  }
  
  // Found it!
  conversationSelect = select;
  console.log('Successfully found and updating conversationSelect');
  
  select.innerHTML = '';
  
  if (conversations.length === 0) {
    select.innerHTML = '<option value="">No conversations</option>';
    return;
  }
  
  conversations.forEach(conv => {
    const option = document.createElement('option');
    option.value = conv.id;
    option.textContent = conv.name;
    if (conv.id === currentConversationId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// Fallback: Create modal manually if it doesn't exist
function createModalManually() {
  const appContainer = document.getElementById('appContainer');
  if (!appContainer) {
    console.error('Cannot create modal - appContainer not found');
    return;
  }
  
  // Check if modal already exists
  let modal = appContainer.querySelector('#createConversationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'createConversationModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const title = document.createElement('h2');
    title.textContent = 'Create New Conversation';
    modalContent.appendChild(title);
    
    const form = document.createElement('form');
    form.id = 'createConversationForm';
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'newConversationName';
    nameInput.placeholder = 'Enter conversation name...';
    nameInput.required = true;
    nameInput.autocomplete = 'off';
    form.appendChild(nameInput);
    
    const errorDiv = document.createElement('div');
    errorDiv.id = 'createConversationError';
    errorDiv.className = 'modal-error';
    errorDiv.style.display = 'none';
    form.appendChild(errorDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'modal-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancelCreateConversation';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    actionsDiv.appendChild(cancelBtn);
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Create';
    actionsDiv.appendChild(submitBtn);
    
    form.appendChild(actionsDiv);
    modalContent.appendChild(form);
    modal.appendChild(modalContent);
    
    // Insert modal into appContainer (before panels-wrapper)
    const panelsWrapper = appContainer.querySelector('.panels-wrapper');
    if (panelsWrapper) {
      appContainer.insertBefore(modal, panelsWrapper);
    } else {
      appContainer.appendChild(modal);
    }
    
    console.log('Manually created conversation modal');
  }
  
  // Show the modal
  modal.style.display = 'flex';
  const nameInput = modal.querySelector('#newConversationName');
  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  }
}

// Fallback: Create dropdown manually if it doesn't exist
async function createDropdownManually() {
  const header = document.querySelector('.app-header');
  if (!header) {
    console.error('Cannot create dropdown - header not found');
    return;
  }
  
  // Check if selector div exists
  let selectorDiv = header.querySelector('.conversation-selector');
  if (!selectorDiv) {
    selectorDiv = document.createElement('div');
    selectorDiv.className = 'conversation-selector';
    header.appendChild(selectorDiv);
  }
  
  // Check if select exists
  let select = selectorDiv.querySelector('select');
  if (!select) {
    select = document.createElement('select');
    select.id = 'conversationSelect';
    select.className = 'conversation-dropdown';
    selectorDiv.insertBefore(select, selectorDiv.firstChild);
  }
  
  // Check if button exists
  let button = selectorDiv.querySelector('#createConversationButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'createConversationButton';
    button.className = 'btn btn-primary';
    button.textContent = '+ New Conversation';
    selectorDiv.appendChild(button);
  }
  
  conversationSelect = select;
  console.log('Manually created conversation dropdown');
  
  // Update dropdown with conversations
  updateConversationDropdown();
  
  // Wait a moment for dropdown to update, then select first conversation and load it
  setTimeout(async () => {
    // If we have conversations
    if (conversations.length > 0) {
      // If no conversation is selected yet, select the first one
      if (!currentConversationId) {
        currentConversationId = conversations[0].id;
        console.log('No conversation selected, selecting first:', currentConversationId);
      } else {
        console.log('Conversation already selected:', currentConversationId);
      }
      
      // Set the select value to match currentConversationId
      if (select && currentConversationId) {
        select.value = currentConversationId;
        console.log('Set select value to conversation:', currentConversationId);
      }
      
      // Always load the conversation data if we have a conversationId
      if (currentConversationId) {
        console.log('About to load conversation data for:', currentConversationId);
        try {
          await loadConversationData();
          console.log('Conversation data loaded successfully');
        } catch (error) {
          console.error('Error loading conversation data:', error);
        }
      } else {
        console.error('No currentConversationId to load!');
      }
    } else {
      console.warn('No conversations available to load');
    }
  }, 150);
}

// Load conversation data for the selected conversation
async function loadConversationData() {
  if (!currentConversationId) {
    console.warn('loadConversationData called but no currentConversationId');
    return;
  }
  
  console.log('Loading conversation data for ID:', currentConversationId);
  
  // Reset conversation state
  try {
    const resetResponse = await fetch('/api/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: currentConversationId }),
      credentials: 'include'
    });
    if (!resetResponse.ok) {
      console.error('Failed to reset conversation:', resetResponse.status);
    }
  } catch (error) {
    console.error('Error resetting conversation:', error);
  }
  
  // Clear UI
  if (chatMessages) chatMessages.innerHTML = '';
  if (systemNotes) systemNotes.innerHTML = '';
  systemActionCounter = 0;
  aiAgentMessageNumber = 0;
  conversationIndex = 0;
  currentlyEditingMessage = null;
  currentlyEditingSystemAction = null;
  isWaitingForResponse = false;
  
  if (messageInput) {
    messageInput.value = '';
    messageInput.disabled = false;
    autoResizeTextarea(messageInput);
  }
  
  if (sendButton) {
    sendButton.disabled = false;
  }
  
  if (autoFillIndicator) {
    autoFillIndicator.style.display = 'none';
  }
  
  // Load conversation editor
  try {
    await loadConversationEditor();
    updateAddRowButtonText(null);
    
    // Send empty message to trigger first AI response
    console.log('Triggering first AI message');
    sendMessage('', true);
  } catch (error) {
    console.error('Error loading conversation editor:', error);
  }
}

// Event handlers are now set up in setupConversationHandlers() function

// Initialize app (moved from DOMContentLoaded)
async function initializeApp() {
  console.log('Initializing app...');
  
  // Set up auto-resize for message input
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      autoResizeTextarea(messageInput);
    });
  }
  
  // Set up conversation handlers immediately (uses event delegation, doesn't need elements)
  setupConversationHandlers();
  
  // Wait for DOM to be fully ready, then initialize
  // Use multiple strategies to ensure elements are found
  setTimeout(() => {
    initConversationElements();
    
    // Load conversations after a delay to ensure DOM is ready
    setTimeout(() => {
      loadConversations();
    }, 200);
  }, 100);
}

// Set up conversation event handlers - query elements directly
function setupConversationHandlers() {
  // Handle conversation selection change - use event delegation
  const appContainer = document.getElementById('appContainer');
  if (appContainer) {
    // Use event delegation on the container
    appContainer.addEventListener('change', async (e) => {
      if (e.target.id === 'conversationSelect') {
        const newConversationId = e.target.value;
        if (newConversationId && newConversationId !== currentConversationId) {
          currentConversationId = newConversationId;
          await loadConversationData();
        }
      }
    });
    
    // Handle create conversation button click
    appContainer.addEventListener('click', (e) => {
      // Check if the click is on the button or inside it
      const button = e.target.closest('#createConversationButton') || 
                     (e.target.id === 'createConversationButton' ? e.target : null);
      
      if (button) {
        console.log('Create conversation button clicked');
        e.preventDefault();
        e.stopPropagation();
        
        const modal = getConversationElement('createConversationModal');
        const nameInput = getConversationElement('newConversationName');
        console.log('Modal found:', !!modal, 'Name input found:', !!nameInput);
        
        if (modal) {
          modal.style.display = 'flex';
          console.log('Modal displayed');
          if (nameInput) {
            nameInput.value = '';
            // Focus after a brief delay to ensure modal is visible
            setTimeout(() => {
              nameInput.focus();
            }, 50);
          }
        } else {
          console.error('Modal not found! Trying to find it...');
          // Try to find modal using different methods
          const modalById = document.getElementById('createConversationModal');
          const modalByQuery = document.querySelector('#createConversationModal');
          const modalInBody = document.body.querySelector('#createConversationModal');
          const allModals = document.querySelectorAll('[id="createConversationModal"]');
          console.log('Modal search results:', {
            byId: !!modalById,
            byQuery: !!modalByQuery,
            inBody: !!modalInBody,
            allModals: allModals.length,
            appContainer: !!appContainer,
            appContainerHTML: appContainer ? appContainer.innerHTML.substring(0, 500) : 'no container'
          });
          
          // If we found it by another method, use it
          if (modalById || modalByQuery || modalInBody || allModals.length > 0) {
            const foundModal = modalById || modalByQuery || modalInBody || allModals[0];
            foundModal.style.display = 'flex';
            const nameInput = document.getElementById('newConversationName') || 
                            document.querySelector('#newConversationName');
            if (nameInput) {
              nameInput.value = '';
              setTimeout(() => nameInput.focus(), 50);
            }
          } else {
            // Modal doesn't exist - create it
            console.log('Creating modal manually');
            createModalManually();
          }
        }
      }
      
      if (e.target.id === 'cancelCreateConversation') {
        const modal = getConversationElement('createConversationModal');
        const errorDiv = getConversationElement('createConversationError');
        if (modal) {
          modal.style.display = 'none';
        }
        if (errorDiv) {
          errorDiv.style.display = 'none';
          errorDiv.textContent = '';
        }
      }
    });
    
    // Handle create conversation form submission
    appContainer.addEventListener('submit', async (e) => {
      if (e.target.id === 'createConversationForm') {
        e.preventDefault();
        
        const nameInput = getConversationElement('newConversationName');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
          return;
        }
        
        // Clear previous error
        const errorDiv = getConversationElement('createConversationError');
        if (errorDiv) {
          errorDiv.style.display = 'none';
          errorDiv.textContent = '';
        }
        
        try {
          const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
            credentials: 'include'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create conversation');
          }
          
          const newConversation = await response.json();
          
          // Add to conversations list
          conversations.unshift(newConversation);
          updateConversationDropdown();
          
          // Select the new conversation
          currentConversationId = newConversation.id;
          const select = getConversationElement('conversationSelect');
          if (select) {
            select.value = currentConversationId;
          }
          
          // Hide modal
          const modal = getConversationElement('createConversationModal');
          if (modal) {
            modal.style.display = 'none';
          }
          if (nameInput) {
            nameInput.value = '';
          }
          
          // Load the new conversation
          await loadConversationData();
        } catch (error) {
          if (errorDiv) {
            errorDiv.textContent = error.message || 'Failed to create conversation';
            errorDiv.style.display = 'block';
          }
        }
      }
    });
  }
}

// Initialize: Check authentication and load app
window.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuthentication();
  
  if (isAuthenticated) {
    showApp();
    initializeApp();
  } else {
    showPasswordPrompt();
  }
});

// Send message function
async function sendMessage(userMessage, isInitial = false) {
  if (isWaitingForResponse && !isInitial) {
    return;
  }

  // Display user message if not initial
  if (!isInitial && userMessage.trim()) {
    addMessage('Merchant', userMessage);
  }

  // Clear input
  messageInput.value = '';
  autoResizeTextarea(messageInput);
  messageInput.disabled = true;
  sendButton.disabled = true;
  isWaitingForResponse = true;
  autoFillIndicator.style.display = 'none';

  if (!currentConversationId) {
    console.error('No conversation selected');
    return;
  }

  try {
    const response = await fetch('/api/next-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        conversationId: currentConversationId,
        message: userMessage 
      }),
      credentials: 'include'
    });

    const data = await response.json();

    if (data.aiMessage) {
      // Add typing indicator
      const typingId = addTypingIndicator();
      
      // Simulate typing delay for better UX
      setTimeout(() => {
        removeTypingIndicator(typingId);
        addMessage('AI Agent', data.aiMessage, data.systemActions || []);
        
        // Auto-fill next merchant message if available
        if (data.merchantMessage) {
          setTimeout(() => {
            messageInput.value = data.merchantMessage;
            autoResizeTextarea(messageInput);
            messageInput.disabled = false;
            sendButton.disabled = false;
            autoFillIndicator.style.display = 'block';
            messageInput.focus();
            isWaitingForResponse = false;
            
            // Highlight the input to show it's auto-filled
            messageInput.classList.add('auto-filled');
            setTimeout(() => {
              messageInput.classList.remove('auto-filled');
            }, 2000);
          }, 500);
        } else {
          messageInput.disabled = false;
          sendButton.disabled = false;
          isWaitingForResponse = false;
        }
      }, 800);
    } else {
      // No more messages
      addMessage('AI Agent', 'Conversation complete!');
      messageInput.disabled = true;
      sendButton.disabled = true;
      isWaitingForResponse = false;
    }
  } catch (error) {
    console.error('Error:', error);
    addMessage('System', 'Error: Could not connect to server. Please try again.');
    messageInput.disabled = false;
    sendButton.disabled = false;
    isWaitingForResponse = false;
  }
}

// Parse and style structured information blocks
function parseStructuredBlocks(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this line is a header (ends with ":" and is followed by structured content)
    if (line.trim().endsWith(':') && line.trim().length > 0 && !line.trim().startsWith('[')) {
      // Check if next non-empty line is structured content (key-value pair or bullet point)
      let j = i + 1;
      let hasStructuredContent = false;
      
      // Look ahead to see if this is a structured block
      while (j < lines.length && lines[j].trim() !== '') {
        const nextLine = lines[j].trim();
        // Check for key-value pair, bullet point, or nested section header
        if ((nextLine.includes(':') && !nextLine.startsWith('[')) || 
            nextLine.startsWith('-') || 
            nextLine.startsWith('•') ||
            (nextLine.endsWith(':') && nextLine.length < 50)) {
          hasStructuredContent = true;
          break;
        }
        j++;
      }
      
      if (hasStructuredContent) {
        // This is a structured block - collect all lines until blank line or end
        const blockLines = [line];
        i++;
        
        while (i < lines.length && lines[i].trim() !== '') {
          blockLines.push(lines[i]);
          i++;
        }
        
        // Parse the block
        const header = blockLines[0].trim();
        const contentLines = blockLines.slice(1);
        
        // Build HTML for the structured block
        let blockHtml = `<div class="structured-block"><div class="structured-header">${header}</div>`;
        
        contentLines.forEach(contentLine => {
          const trimmed = contentLine.trim();
          
          // Handle nested section headers (like "Targeting:", "Prompt Configuration:")
          if (trimmed.endsWith(':') && trimmed.length < 50 && !trimmed.includes('"')) {
            blockHtml += `<div class="structured-section-header">${trimmed}</div>`;
          }
          // Handle bullet points
          else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
            const bulletContent = trimmed.substring(1).trim();
            blockHtml += `<div class="structured-item structured-bullet">${bulletContent}</div>`;
          }
          // Handle key-value pairs
          else if (trimmed.includes(':')) {
            const colonIndex = trimmed.indexOf(':');
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            
            if (value === '') {
              // Empty value, just show key
              blockHtml += `<div class="structured-item">${key}</div>`;
            } else {
              // Regular key-value pair
              blockHtml += `<div class="structured-item"><span class="structured-key">${key}:</span> <span class="structured-value">${value}</span></div>`;
            }
          } else {
            // Regular text line (treat as list item if it's short and not a full sentence)
            if (trimmed.length < 100 && !trimmed.endsWith('.') && !trimmed.endsWith('!') && !trimmed.endsWith('?')) {
              blockHtml += `<div class="structured-item structured-bullet">${trimmed}</div>`;
            } else {
              blockHtml += `<div class="structured-item">${trimmed}</div>`;
            }
          }
        });
        
        blockHtml += '</div>';
        result.push(blockHtml);
        continue;
      }
    }
    
    // Regular line - add as is
    result.push(line);
    i++;
  }
  
  return result.join('\n');
}

// Extract system actions from message (actions that involve external data sources)
function extractSystemActions(message, speaker) {
  if (speaker !== 'AI Agent') {
    return []; // Only extract from AI Agent messages
  }
  
  const bracketRegex = /\[([^\]]+)\]/g;
  const actions = [];
  let match;
  
  // System action keywords that indicate external data operations
  const systemActionKeywords = [
    'calls', 'call', 'fetches', 'fetch', 'fetched', 'creates', 'create', 'created',
    'updates', 'update', 'updated', 'configures', 'configure', 'configured',
    'checks', 'check', 'checked', 'activates', 'activate', 'activated',
    'sets up', 'set up', 'pulls', 'pull', 'pulled', 'retrieves', 'retrieve', 'retrieved'
  ];
  
  while ((match = bracketRegex.exec(message)) !== null) {
    const content = match[1];
    // Check if this action involves external data operations
    const isSystemAction = systemActionKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    
    if (isSystemAction) {
      actions.push({
        content: content,
        originalMatch: match[0]
      });
    }
  }
  
  return actions;
}

// Parse and style actions in brackets (removing system actions from display)
function parseMessage(message, speaker) {
  // First, extract system actions
  const systemActions = extractSystemActions(message, speaker);
  
  // Remove system actions from the message text
  let processedMessage = message;
  systemActions.forEach(action => {
    // Replace the action with empty string, handling surrounding newlines
    processedMessage = processedMessage.replace(action.originalMatch, '');
  });
  
  // Clean up extra whitespace and newlines
  processedMessage = processedMessage
    .replace(/\n\n\n+/g, '\n\n')  // Multiple newlines to double
    .replace(/^\n+|\n+$/g, '')     // Remove leading/trailing newlines
    .trim();
  
  // Find remaining bracketed text (merchant actions) and replace with styled spans
  // Do this before Markdown rendering so brackets don't interfere
  const bracketRegex = /\[([^\]]+)\]/g;
  processedMessage = processedMessage.replace(bracketRegex, (match, content) => {
    return `<span class="merchant-action">${content}</span>`;
  });
  
  // Parse structured blocks (this returns HTML for structured blocks, plain text for regular content)
  let html = parseStructuredBlocks(processedMessage);
  
  // Apply Markdown rendering to text parts (not HTML structured blocks)
  // Split by structured block HTML, apply Markdown to text parts, then rejoin
  const structuredBlockRegex = /<div class="structured-block">[\s\S]*?<\/div>/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let hasStructuredBlocks = false;
  
  // Find all structured blocks and the text between them
  while ((match = structuredBlockRegex.exec(html)) !== null) {
    hasStructuredBlocks = true;
    // Add text before this structured block (apply Markdown to it)
    if (match.index > lastIndex) {
      const textPart = html.substring(lastIndex, match.index);
      if (textPart.trim()) {
        // Apply Markdown rendering to text parts
        const markdownHtml = marked.parse(textPart.trim(), { breaks: true });
        parts.push(markdownHtml);
      }
    }
    // Add the structured block HTML as-is
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last structured block
  if (lastIndex < html.length) {
    const textPart = html.substring(lastIndex);
    if (textPart.trim()) {
      const markdownHtml = marked.parse(textPart.trim(), { breaks: true });
      parts.push(markdownHtml);
    }
  }
  
  // If no structured blocks were found, apply Markdown to entire message
  if (!hasStructuredBlocks) {
    html = marked.parse(html.trim(), { breaks: true });
  } else {
    html = parts.join('');
  }
  
  return { html, systemActions };
}

// Add system action to system notes panel
function addSystemAction(actionContent, messageCode, conversationDataIndex = -1, actionIndex = -1) {
  const actionDiv = document.createElement('div');
  actionDiv.className = 'system-action-item system-action-editable';
  actionDiv.setAttribute('data-action-id', systemActionCounter++);
  actionDiv.setAttribute('data-message-code', messageCode);
  
  // Store indices for editing
  if (conversationDataIndex !== -1) {
    actionDiv.setAttribute('data-conversation-index', conversationDataIndex);
    actionDiv.setAttribute('data-action-index', actionIndex);
  }
  
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const timeDiv = document.createElement('div');
  timeDiv.className = 'system-action-time';
  timeDiv.textContent = timestamp;
  
  const codeDiv = document.createElement('div');
  codeDiv.className = 'system-action-code';
  codeDiv.textContent = messageCode;
  codeDiv.style.cursor = 'pointer';
  codeDiv.title = 'Click to highlight related message';
  codeDiv.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering edit mode
    // Extract base message code (e.g., "1.1" -> "1")
    const baseCode = messageCode.split('.')[0];
    highlightRelatedItems(baseCode);
  });
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'system-action-content';
  // Strip brackets for display (they're only needed for parsing)
  const displayContent = actionContent.trim();
  const strippedContent = (displayContent.startsWith('[') && displayContent.endsWith(']'))
    ? displayContent.slice(1, -1)
    : displayContent;
  contentDiv.textContent = strippedContent;
  
  actionDiv.appendChild(timeDiv);
  actionDiv.appendChild(codeDiv);
  actionDiv.appendChild(contentDiv);
  
  // Add click handler for editing (only if we have data indices)
  if (conversationDataIndex !== -1 && actionIndex !== -1) {
    actionDiv.style.cursor = 'pointer';
    actionDiv.title = 'Click to edit system action';
    actionDiv.addEventListener('click', (e) => {
      // Don't trigger edit if clicking on code or other interactive elements
      if (e.target.closest('.system-action-code') || e.target.closest('.edit-controls')) {
        return;
      }
      enterSystemActionEditMode(actionDiv, conversationDataIndex, actionIndex);
    });
  }
  
  systemNotes.appendChild(actionDiv);
  scrollSystemNotes();
}

// Add message to chat
function addMessage(speaker, message, systemActionsFromAPI = []) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${speaker.toLowerCase().replace(' ', '-')}`;
  
  // Find the corresponding conversationData index
  let dataIndex = -1;
  
  // Normalize messages for comparison (trim and normalize whitespace)
  const normalizeMessage = (msg) => msg.replace(/\\n/g, '\n').trim().replace(/\s+/g, ' ');
  const normalizedMessage = normalizeMessage(message);
  
  // First, try to find exact or close match starting from conversationIndex
  for (let i = conversationIndex; i < conversationData.length; i++) {
    if (conversationData[i].speaker === speaker) {
      const normalizedDataMessage = normalizeMessage(conversationData[i].message);
      // Check if messages match (exact or very similar)
      if (normalizedDataMessage === normalizedMessage || 
          normalizedDataMessage.includes(normalizedMessage.substring(0, 50)) ||
          normalizedMessage.includes(normalizedDataMessage.substring(0, 50))) {
        // Check if this index hasn't been used yet
        const used = Array.from(chatMessages.querySelectorAll('.message'))
          .some(msg => parseInt(msg.getAttribute('data-conversation-index')) === i);
        if (!used) {
          dataIndex = i;
          conversationIndex = i + 1; // Update for next message
          break;
        }
      }
    }
  }
  
  // If still not found, use sequential matching by speaker
  if (dataIndex === -1) {
    const existingIndices = Array.from(chatMessages.querySelectorAll('.message'))
      .map(msg => parseInt(msg.getAttribute('data-conversation-index')))
      .filter(idx => !isNaN(idx));
    
    for (let i = 0; i < conversationData.length; i++) {
      if (conversationData[i].speaker === speaker && !existingIndices.includes(i)) {
        dataIndex = i;
        conversationIndex = i + 1;
        break;
      }
    }
  }
  
  // Store conversationData index for editing
  if (dataIndex !== -1) {
    messageDiv.setAttribute('data-conversation-index', dataIndex);
  }
  
  // Track AI Agent message numbers and generate codes
  let messageCode = null;
  let actionCounter = 0;
  
  if (speaker === 'AI Agent') {
    aiAgentMessageNumber++;
    messageCode = `${aiAgentMessageNumber}`;
  }
  
  const speakerDiv = document.createElement('div');
  speakerDiv.className = 'message-speaker';
  
  // Display speaker with message code for AI Agent
  if (speaker === 'AI Agent' && messageCode) {
    const codeSpan = document.createElement('span');
    codeSpan.className = 'message-code';
    codeSpan.textContent = `- ${messageCode}`;
    codeSpan.style.cursor = 'pointer';
    codeSpan.title = 'Click to highlight related system actions';
    codeSpan.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering message edit
      highlightRelatedItems(messageCode);
    });
    speakerDiv.appendChild(document.createTextNode(speaker + ' '));
    speakerDiv.appendChild(codeSpan);
    messageDiv.setAttribute('data-message-code', messageCode);
  } else {
    speakerDiv.textContent = speaker;
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // Parse message to extract system actions and get HTML
  const parsed = parseMessage(message, speaker);
  contentDiv.innerHTML = parsed.html;
  
  // Use system actions from API if provided, otherwise use parsed actions
  const systemActionsToUse = systemActionsFromAPI.length > 0 
    ? systemActionsFromAPI.map(action => ({ content: action }))
    : parsed.systemActions;
  
  // Add system actions to the system notes panel with codes
  if (systemActionsToUse && systemActionsToUse.length > 0 && messageCode && dataIndex !== -1) {
    // Get existing system actions from conversationData
    const existingActions = conversationData[dataIndex].system_actions 
      ? parseSystemActions(conversationData[dataIndex].system_actions)
      : [];
    
    systemActionsToUse.forEach((action, index) => {
      actionCounter++;
      const actionCode = `${messageCode}.${actionCounter}`;
      const actionContent = typeof action === 'string' ? action : action.content;
      // Find the index in the existing actions array, or use the current index if not found
      let actionIndexInData = existingActions.findIndex(a => a === actionContent || a.includes(actionContent.substring(0, 20)));
      if (actionIndexInData === -1) {
        // If not found, try to match by position or add at the end
        if (index < existingActions.length) {
          actionIndexInData = index;
        } else {
          actionIndexInData = existingActions.length;
          // Add to conversationData if it doesn't exist
          existingActions.push(actionContent);
          conversationData[dataIndex].system_actions = formatSystemActions(existingActions);
        }
      }
      addSystemAction(actionContent, actionCode, dataIndex, actionIndexInData);
    });
  }
  
  messageDiv.appendChild(speakerDiv);
  messageDiv.appendChild(contentDiv);
  
  // Add click handler for editing (only if we have a data index)
  if (dataIndex !== -1) {
    messageDiv.classList.add('message-editable');
    messageDiv.style.cursor = 'pointer';
    messageDiv.title = 'Click to edit message';
    messageDiv.addEventListener('click', (e) => {
      // Don't trigger edit if clicking on code span or other interactive elements
      if (e.target.closest('.message-code') || e.target.closest('.edit-controls')) {
        return;
      }
      enterEditMode(messageDiv, dataIndex);
    });
  }
  
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Enter edit mode for a message
function enterEditMode(messageDiv, dataIndex) {
  // If already editing another message, cancel it first
  if (currentlyEditingMessage && currentlyEditingMessage !== messageDiv) {
    cancelEditMode(currentlyEditingMessage);
  }
  
  // Don't enter edit mode if already editing this message
  if (messageDiv.classList.contains('editing')) {
    return;
  }
  
  currentlyEditingMessage = messageDiv;
  
  // Store the original width before entering edit mode
  const originalWidth = messageDiv.offsetWidth;
  messageDiv.style.minWidth = originalWidth + 'px';
  
  messageDiv.classList.add('editing');
  
  const contentDiv = messageDiv.querySelector('.message-content');
  const originalContent = conversationData[dataIndex].message.replace(/\\n/g, '\n');
  const originalHTML = contentDiv.innerHTML;
  
  // Create edit container
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container';
  
  // Create textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'message-edit-textarea';
  textarea.value = originalContent;
  textarea.rows = Math.max(3, originalContent.split('\n').length);
  
  // Create edit controls
  const editControls = document.createElement('div');
  editControls.className = 'edit-controls';
  
  const saveButton = document.createElement('button');
  saveButton.className = 'btn btn-primary edit-save-btn';
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', (e) => {
    e.stopPropagation();
    saveMessageEdit(messageDiv, dataIndex, textarea.value);
  });
  
  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn btn-secondary edit-cancel-btn';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEditMode(messageDiv);
  });
  
  editControls.appendChild(saveButton);
  editControls.appendChild(cancelButton);
  
  editContainer.appendChild(textarea);
  editContainer.appendChild(editControls);
  
  // Replace content with edit container
  contentDiv.innerHTML = '';
  contentDiv.appendChild(editContainer);
  
  // Focus textarea
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 10);
  
  // Save on Enter (Ctrl/Cmd + Enter)
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveMessageEdit(messageDiv, dataIndex, textarea.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditMode(messageDiv);
    }
  });
}

// Cancel edit mode
function cancelEditMode(messageDiv) {
  if (!messageDiv || !messageDiv.classList.contains('editing')) {
    return;
  }
  
  // Remove the min-width that was set for editing
  messageDiv.style.minWidth = '';
  
  messageDiv.classList.remove('editing');
  const dataIndex = parseInt(messageDiv.getAttribute('data-conversation-index'));
  
  if (dataIndex !== -1 && conversationData[dataIndex]) {
    const contentDiv = messageDiv.querySelector('.message-content');
    const speaker = conversationData[dataIndex].speaker;
    const message = conversationData[dataIndex].message.replace(/\\n/g, '\n');
    
    // Restore original content
    const parsed = parseMessage(message, speaker);
    contentDiv.innerHTML = parsed.html;
  }
  
  if (currentlyEditingMessage === messageDiv) {
    currentlyEditingMessage = null;
  }
}

// Save message edit
async function saveMessageEdit(messageDiv, dataIndex, newMessage) {
  if (dataIndex === -1 || !conversationData[dataIndex]) {
    console.error('Invalid data index for saving message');
    cancelEditMode(messageDiv);
    return;
  }
  
  // Update conversationData
  const oldMessage = conversationData[dataIndex].message;
  conversationData[dataIndex].message = newMessage.replace(/\n/g, '\\n');
  
  // Update the message display
  // Remove the min-width that was set for editing
  messageDiv.style.minWidth = '';
  messageDiv.classList.remove('editing');
  const contentDiv = messageDiv.querySelector('.message-content');
  const speaker = conversationData[dataIndex].speaker;
  const parsed = parseMessage(newMessage, speaker);
  contentDiv.innerHTML = parsed.html;
  
  // Save to backend
  try {
    const sortedData = [...conversationData].sort((a, b) => {
      const turnA = parseInt(a.turn) || 0;
      const turnB = parseInt(b.turn) || 0;
      return turnA - turnB;
    });
    
    sortedData.forEach((row, index) => {
      row.turn = index + 1;
    });
    
    if (!currentConversationId) {
      alert('No conversation selected');
      return;
    }
    
    const response = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: currentConversationId,
        conversationData: sortedData
      }),
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Update the Conversation Editor table
      renderConversationTable();
      
      // Show a brief success indicator
      messageDiv.classList.add('edit-saved');
      setTimeout(() => {
        messageDiv.classList.remove('edit-saved');
      }, 2000);
      
      currentlyEditingMessage = null;
    } else {
      // Revert on error
      conversationData[dataIndex].message = oldMessage;
      cancelEditMode(messageDiv);
      alert('Failed to save message: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving message:', error);
    // Revert on error
    conversationData[dataIndex].message = oldMessage;
    cancelEditMode(messageDiv);
    alert('Failed to save message. Please try again.');
  }
}

// Enter edit mode for a system action
function enterSystemActionEditMode(actionDiv, conversationDataIndex, actionIndex) {
  // If already editing another system action, cancel it first
  if (currentlyEditingSystemAction && currentlyEditingSystemAction !== actionDiv) {
    cancelSystemActionEditMode(currentlyEditingSystemAction);
  }
  
  // Don't enter edit mode if already editing this action
  if (actionDiv.classList.contains('editing')) {
    return;
  }
  
  currentlyEditingSystemAction = actionDiv;
  actionDiv.classList.add('editing');
  
  const contentDiv = actionDiv.querySelector('.system-action-content');
  const systemActions = conversationData[conversationDataIndex].system_actions 
    ? parseSystemActions(conversationData[conversationDataIndex].system_actions)
    : [];
  let originalContent = systemActions[actionIndex] || '';
  // Strip brackets for editing (they'll be added back when saving)
  if (originalContent.startsWith('[') && originalContent.endsWith(']')) {
    originalContent = originalContent.slice(1, -1);
  }
  
  // Create edit container
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container';
  
  // Create textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'system-action-edit-textarea';
  textarea.value = originalContent;
  textarea.rows = 2;
  
  // Create edit controls
  const editControls = document.createElement('div');
  editControls.className = 'edit-controls';
  
  const saveButton = document.createElement('button');
  saveButton.className = 'btn btn-primary edit-save-btn';
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', (e) => {
    e.stopPropagation();
    saveSystemActionEdit(actionDiv, conversationDataIndex, actionIndex, textarea.value);
  });
  
  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn btn-secondary edit-cancel-btn';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelSystemActionEditMode(actionDiv);
  });
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn btn-secondary edit-delete-btn';
  deleteButton.textContent = 'Delete';
  deleteButton.style.background = 'var(--color-danger)';
  deleteButton.style.color = 'white';
  deleteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Delete this system action?')) {
      deleteSystemAction(actionDiv, conversationDataIndex, actionIndex);
    }
  });
  
  editControls.appendChild(saveButton);
  editControls.appendChild(cancelButton);
  editControls.appendChild(deleteButton);
  
  editContainer.appendChild(textarea);
  editContainer.appendChild(editControls);
  
  // Replace content with edit container
  contentDiv.innerHTML = '';
  contentDiv.appendChild(editContainer);
  
  // Focus textarea
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 10);
  
  // Save on Enter (Ctrl/Cmd + Enter)
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveSystemActionEdit(actionDiv, conversationDataIndex, actionIndex, textarea.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelSystemActionEditMode(actionDiv);
    }
  });
}

// Cancel edit mode for system action
function cancelSystemActionEditMode(actionDiv) {
  if (!actionDiv || !actionDiv.classList.contains('editing')) {
    return;
  }
  
  actionDiv.classList.remove('editing');
  const conversationDataIndex = parseInt(actionDiv.getAttribute('data-conversation-index'));
  const actionIndex = parseInt(actionDiv.getAttribute('data-action-index'));
  
  if (conversationDataIndex !== -1 && actionIndex !== -1 && conversationData[conversationDataIndex]) {
    const contentDiv = actionDiv.querySelector('.system-action-content');
    const systemActions = conversationData[conversationDataIndex].system_actions 
      ? parseSystemActions(conversationData[conversationDataIndex].system_actions)
      : [];
    const originalContent = systemActions[actionIndex] || '';
    
    // If the action was empty (newly created) and user cancels, remove it
    if (originalContent === '' && actionIndex >= systemActions.length - 1) {
      // Remove empty action from conversationData
      systemActions.pop();
      conversationData[conversationDataIndex].system_actions = formatSystemActions(systemActions);
      // Remove from UI
      actionDiv.remove();
    } else {
      // Restore original content (strip brackets for display)
      let displayContent = originalContent;
      if (displayContent.startsWith('[') && displayContent.endsWith(']')) {
        displayContent = displayContent.slice(1, -1);
      }
      contentDiv.textContent = displayContent;
    }
  }
  
  if (currentlyEditingSystemAction === actionDiv) {
    currentlyEditingSystemAction = null;
  }
}

// Save system action edit
async function saveSystemActionEdit(actionDiv, conversationDataIndex, actionIndex, newContent) {
  if (conversationDataIndex === -1 || actionIndex === -1 || !conversationData[conversationDataIndex]) {
    console.error('Invalid indices for saving system action');
    cancelSystemActionEditMode(actionDiv);
    return;
  }
  
  // Update conversationData
  let systemActions = conversationData[conversationDataIndex].system_actions 
    ? parseSystemActions(conversationData[conversationDataIndex].system_actions)
    : [];
  
  const trimmedContent = newContent.trim();
  
  // If saving empty content, remove the action
  if (trimmedContent === '') {
    if (actionIndex < systemActions.length) {
      systemActions.splice(actionIndex, 1);
      actionDiv.remove();
    }
    conversationData[conversationDataIndex].system_actions = formatSystemActions(systemActions.filter(s => s.trim() !== ''));
    
    // Save to backend
    try {
      const sortedData = [...conversationData].sort((a, b) => {
        const turnA = parseInt(a.turn) || 0;
        const turnB = parseInt(b.turn) || 0;
        return turnA - turnB;
      });
      
      sortedData.forEach((row, index) => {
        row.turn = index + 1;
      });
      
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sortedData),
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        renderConversationTable();
      }
    } catch (error) {
      console.error('Error saving:', error);
    }
    
    currentlyEditingSystemAction = null;
    return;
  }
  
  if (actionIndex >= systemActions.length) {
    // Add new action
    systemActions.push(trimmedContent);
  } else {
    // Update existing action
    systemActions[actionIndex] = trimmedContent;
  }
  
  // Filter out empty actions before saving
  systemActions = systemActions.filter(s => s.trim() !== '');
  
  const oldSystemActions = conversationData[conversationDataIndex].system_actions;
  conversationData[conversationDataIndex].system_actions = formatSystemActions(systemActions);
  
  // Update the display
  actionDiv.classList.remove('editing');
  const contentDiv = actionDiv.querySelector('.system-action-content');
  // Strip brackets for display (they're only needed for parsing)
  let displayContent = trimmedContent;
  if (displayContent.startsWith('[') && displayContent.endsWith(']')) {
    displayContent = displayContent.slice(1, -1);
  }
  contentDiv.textContent = displayContent;
  
  // Save to backend
  try {
    const sortedData = [...conversationData].sort((a, b) => {
      const turnA = parseInt(a.turn) || 0;
      const turnB = parseInt(b.turn) || 0;
      return turnA - turnB;
    });
    
    sortedData.forEach((row, index) => {
      row.turn = index + 1;
    });
    
    if (!currentConversationId) {
      alert('No conversation selected');
      return;
    }
    
    const response = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: currentConversationId,
        conversationData: sortedData
      }),
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Update the Conversation Editor table
      renderConversationTable();
      
      // Show a brief success indicator
      actionDiv.classList.add('edit-saved');
      setTimeout(() => {
        actionDiv.classList.remove('edit-saved');
      }, 2000);
      
      currentlyEditingSystemAction = null;
    } else {
      // Revert on error
      conversationData[conversationDataIndex].system_actions = oldSystemActions;
      cancelSystemActionEditMode(actionDiv);
      alert('Failed to save system action: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving system action:', error);
    // Revert on error
    conversationData[conversationDataIndex].system_actions = oldSystemActions;
    cancelSystemActionEditMode(actionDiv);
    alert('Failed to save system action. Please try again.');
  }
}

// Delete system action
async function deleteSystemAction(actionDiv, conversationDataIndex, actionIndex) {
  if (conversationDataIndex === -1 || actionIndex === -1 || !conversationData[conversationDataIndex]) {
    console.error('Invalid indices for deleting system action');
    return;
  }
  
  // Update conversationData
  const systemActions = conversationData[conversationDataIndex].system_actions 
    ? parseSystemActions(conversationData[conversationDataIndex].system_actions)
    : [];
  
  if (actionIndex < systemActions.length) {
    systemActions.splice(actionIndex, 1);
    const oldSystemActions = conversationData[conversationDataIndex].system_actions;
    conversationData[conversationDataIndex].system_actions = formatSystemActions(systemActions);
    
    // Remove from UI
    actionDiv.remove();
    
    // Save to backend
    try {
      const sortedData = [...conversationData].sort((a, b) => {
        const turnA = parseInt(a.turn) || 0;
        const turnB = parseInt(b.turn) || 0;
        return turnA - turnB;
      });
      
      sortedData.forEach((row, index) => {
        row.turn = index + 1;
      });
      
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sortedData),
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Update the Conversation Editor table
        renderConversationTable();
      } else {
        // Revert on error
        conversationData[conversationDataIndex].system_actions = oldSystemActions;
        alert('Failed to delete system action: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting system action:', error);
      conversationData[conversationDataIndex].system_actions = oldSystemActions;
      alert('Failed to delete system action. Please try again.');
    }
  }
}

// Create new system action for most recent message
function createNewSystemAction() {
  // Find the most recent AI Agent message in the conversation
  let mostRecentAIMessage = null;
  let mostRecentAIMessageIndex = -1;
  let mostRecentAIMessageCode = null;
  
  // Look through all messages in chat
  const allMessages = Array.from(chatMessages.querySelectorAll('.message'));
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i];
    const messageCode = msg.getAttribute('data-message-code');
    const dataIndex = parseInt(msg.getAttribute('data-conversation-index'));
    
    if (messageCode && dataIndex !== -1 && conversationData[dataIndex] && conversationData[dataIndex].speaker === 'AI Agent') {
      mostRecentAIMessage = msg;
      mostRecentAIMessageIndex = dataIndex;
      mostRecentAIMessageCode = messageCode;
      break;
    }
  }
  
  if (!mostRecentAIMessage || mostRecentAIMessageIndex === -1) {
    alert('No AI Agent message found. Please wait for a message to be displayed first.');
    return;
  }
  
  // Get existing system actions for this message
  const systemActions = conversationData[mostRecentAIMessageIndex].system_actions 
    ? parseSystemActions(conversationData[mostRecentAIMessageIndex].system_actions)
    : [];
  
  // Count existing actions for this message to determine new action code
  const existingActionsForMessage = Array.from(systemNotes.querySelectorAll('.system-action-item'))
    .filter(action => {
      const actionCode = action.getAttribute('data-message-code');
      return actionCode && actionCode.startsWith(mostRecentAIMessageCode + '.');
    });
  
  const newActionNumber = existingActionsForMessage.length + 1;
  const newActionCode = `${mostRecentAIMessageCode}.${newActionNumber}`;
  
  // Add new empty action to conversationData
  systemActions.push('');
  conversationData[mostRecentAIMessageIndex].system_actions = formatSystemActions(systemActions);
  
  // Create and add the system action to the UI
  const newActionIndex = systemActions.length - 1;
  addSystemAction('', newActionCode, mostRecentAIMessageIndex, newActionIndex);
  
  // Immediately enter edit mode for the new action
  const newActionDiv = systemNotes.querySelector(`[data-action-id="${systemActionCounter - 1}"]`);
  if (newActionDiv) {
    setTimeout(() => {
      enterSystemActionEditMode(newActionDiv, mostRecentAIMessageIndex, newActionIndex);
    }, 100);
  }
}

// Add typing indicator
function addTypingIndicator() {
  const typingDiv = document.createElement('div');
  const typingId = 'typing-' + Date.now();
  typingDiv.id = typingId;
  typingDiv.className = 'message ai-agent typing-indicator';
  
  const speakerDiv = document.createElement('div');
  speakerDiv.className = 'message-speaker';
  speakerDiv.textContent = 'AI Agent';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content typing';
  contentDiv.innerHTML = '<span></span><span></span><span></span>';
  
  typingDiv.appendChild(speakerDiv);
  typingDiv.appendChild(contentDiv);
  
  chatMessages.appendChild(typingDiv);
  scrollToBottom();
  
  return typingId;
}

// Remove typing indicator
function removeTypingIndicator(typingId) {
  const typingElement = document.getElementById(typingId);
  if (typingElement) {
    typingElement.remove();
  }
}

// Scroll to bottom of chat
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
  // Sync system notes scroll
  scrollSystemNotes();
}

// Scroll system notes to bottom
function scrollSystemNotes() {
  systemNotes.scrollTop = systemNotes.scrollHeight;
}

// Send button click handler
sendButton.addEventListener('click', () => {
  const message = messageInput.value.trim();
  if (message && !isWaitingForResponse) {
    sendMessage(message);
  }
});

// Enter key handler
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message && !isWaitingForResponse) {
      sendMessage(message);
    }
  }
});

// Reset conversation function
async function resetConversation() {
  if (isWaitingForResponse) {
    return; // Don't reset while waiting for a response
  }

  if (!currentConversationId) {
    return;
  }

  try {
    // Call reset endpoint
    await fetch('/api/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: currentConversationId }),
      credentials: 'include'
    });

    // Clear all messages from UI
    chatMessages.innerHTML = '';
    systemNotes.innerHTML = '';
    systemActionCounter = 0;
    aiAgentMessageNumber = 0;
    conversationIndex = 0;
    currentlyEditingMessage = null;
    currentlyEditingSystemAction = null;
    
    // Reset UI state
    messageInput.value = '';
    autoResizeTextarea(messageInput);
    messageInput.disabled = false;
    sendButton.disabled = false;
    autoFillIndicator.style.display = 'none';
    isWaitingForResponse = false;

    // Restart conversation
    sendMessage('', true);
  } catch (error) {
    console.error('Error resetting conversation:', error);
    addMessage('System', 'Error: Could not reset conversation. Please try again.');
  }
}

// Reset button click handler
resetButton.addEventListener('click', () => {
  if (confirm('Are you sure you want to reset the conversation?')) {
    resetConversation();
  }
});

// Highlight related items when codes are clicked
function highlightRelatedItems(messageCode) {
  // Remove previous highlights
  document.querySelectorAll('.message-highlighted, .system-action-highlighted').forEach(el => {
    el.classList.remove('message-highlighted', 'system-action-highlighted');
  });
  
  // Highlight the message
  const message = document.querySelector(`.message[data-message-code="${messageCode}"]`);
  if (message) {
    message.classList.add('message-highlighted');
    // Scroll to message
    message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  // Highlight related system actions
  const actions = document.querySelectorAll(`.system-action-item[data-message-code^="${messageCode}"]`);
  actions.forEach(action => {
    action.classList.add('system-action-highlighted');
  });
  
  // Remove highlights after 3 seconds
  setTimeout(() => {
    document.querySelectorAll('.message-highlighted, .system-action-highlighted').forEach(el => {
      el.classList.remove('message-highlighted', 'system-action-highlighted');
    });
  }, 3000);
}

// ========== Conversation Editor Functions ==========

let conversationData = [];

// Load conversation data into editor
async function loadConversationEditor() {
  if (!currentConversationId) {
    return;
  }
  
  try {
    const response = await fetch(`/api/conversation?conversationId=${currentConversationId}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    conversationData = await response.json();
    conversationIndex = 0; // Reset conversation index when reloading
    renderConversationTable();
  } catch (error) {
    console.error('Error loading conversation:', error);
    const tbody = document.getElementById('conversationTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #ff4444;">Error loading conversation: ${error.message}</td></tr>`;
    }
  }
}

// Render conversation table
function renderConversationTable() {
  const tbody = document.getElementById('conversationTableBody');
  tbody.innerHTML = '';
  
  conversationData.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-conversation-index', index);
    tr.className = 'conversation-table-row';
    tr.innerHTML = `
      <td class="turn-number">${index + 1}</td>
      <td>
        <select class="table-input speaker-select" data-index="${index}" data-field="speaker">
          <option value="AI Agent" ${row.speaker === 'AI Agent' ? 'selected' : ''}>AI Agent</option>
          <option value="Merchant" ${row.speaker === 'Merchant' ? 'selected' : ''}>Merchant</option>
        </select>
      </td>
      <td><textarea class="table-input message-textarea" data-index="${index}" data-field="message" rows="3">${(row.message || '').replace(/\\n/g, '\n')}</textarea></td>
      <td><textarea class="table-input actions-textarea" data-index="${index}" data-field="system_actions" rows="3" placeholder="[Action 1, with comma],[Action 2]">${(row.system_actions || '').replace(/\\n/g, '\n')}</textarea></td>
      <td><button class="delete-row-button" data-index="${index}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
  
  // Add event listeners
  attachTableEventListeners();
  
  // Update Add Row button text based on current selection
  const selectedRow = document.querySelector('.conversation-table-row.row-selected');
  if (selectedRow) {
    const selectedIndex = parseInt(selectedRow.getAttribute('data-conversation-index'));
    updateAddRowButtonText(isNaN(selectedIndex) ? null : selectedIndex);
  } else {
    updateAddRowButtonText(null);
  }
}

// Update speaker select styling based on selected value
function updateSpeakerSelectStyling() {
  document.querySelectorAll('.speaker-select').forEach(select => {
    if (select.value === 'Merchant') {
      select.classList.add('merchant-selected');
      select.classList.remove('ai-agent-selected');
    } else {
      select.classList.add('ai-agent-selected');
      select.classList.remove('merchant-selected');
    }
  });
}

// Attach event listeners to table inputs
function attachTableEventListeners() {
  document.querySelectorAll('.table-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      let value = e.target.value;
      
      // For message and system_actions fields, preserve newlines but convert to \n for storage
      if (field === 'message' || field === 'system_actions') {
        value = value.replace(/\n/g, '\\n');
      }
      
      conversationData[index][field] = value;
      
      // Update styling for speaker selects
      if (field === 'speaker') {
        updateSpeakerSelectStyling();
      }
    });
    
    // Also handle input event for textareas to save on typing
    if (input.tagName === 'TEXTAREA') {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        let value = e.target.value;
        
        if (field === 'message' || field === 'system_actions') {
          value = value.replace(/\n/g, '\\n');
        }
        
        conversationData[index][field] = value;
      });
    }
  });
  
  // Update speaker select styling after attaching listeners
  updateSpeakerSelectStyling();
  
  document.querySelectorAll('.delete-row-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      if (confirm('Delete this row?')) {
        conversationData.splice(index, 1);
        // Update turn numbers in data (for saving)
        conversationData.forEach((row, i) => {
          row.turn = i + 1;
        });
        renderConversationTable();
      }
    });
  });
  
  // Add row click handlers for navigation to conversation panel
  document.querySelectorAll('.conversation-table-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons, inputs, or selects
      if (e.target.closest('button') || 
          e.target.closest('input') || 
          e.target.closest('select') || 
          e.target.closest('textarea')) {
        return;
      }
      
      const conversationIndex = parseInt(row.getAttribute('data-conversation-index'));
      if (!isNaN(conversationIndex)) {
        // Toggle: if already selected, deselect it; otherwise select it
        if (row.classList.contains('row-selected')) {
          deselectTableRow(row);
        } else {
          selectTableRow(row, conversationIndex);
        }
      }
    });
  });
}

// Select a table row and navigate to corresponding message in conversation panel
function selectTableRow(rowElement, conversationIndex) {
  // Remove previous selection
  document.querySelectorAll('.conversation-table-row').forEach(r => {
    r.classList.remove('row-selected');
    // Reset textarea heights
    const textareas = r.querySelectorAll('textarea');
    textareas.forEach(textarea => {
      textarea.style.height = '';
      textarea.style.overflowY = '';
    });
  });
  
  // Add selection to clicked row
  rowElement.classList.add('row-selected');
  
  // Update Add Row button text
  updateAddRowButtonText(conversationIndex);
  
  // Expand textareas to show all content
  const textareas = rowElement.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    // Reset height to auto to get correct scrollHeight
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    // Set height to show all content, with a reasonable max
    const maxHeight = 500; // Max height in pixels
    textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  });
  
  // Find corresponding message in conversation panel
  const messageElement = chatMessages.querySelector(`.message[data-conversation-index="${conversationIndex}"]`);
  if (messageElement) {
    // Scroll the container to center the message
    const container = chatMessages;
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Get the element's offsetTop relative to the container
      const elementTop = messageElement.offsetTop;
      const elementHeight = messageElement.offsetHeight;
      const containerHeight = container.clientHeight;
      
      // Calculate target scroll position to center the element
      const targetScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
      
      // Scroll to the calculated position
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
      
      // Add a temporary highlight to the message
      messageElement.classList.add('message-highlighted');
      setTimeout(() => {
        messageElement.classList.remove('message-highlighted');
      }, 2000);
    });
  } else {
    // Message doesn't exist yet - could show a message or do nothing
    console.log(`Message with conversation index ${conversationIndex} not found in conversation panel. Make sure the conversation has progressed to this message.`);
    // Show all available indices for debugging
    const allIndices = Array.from(chatMessages.querySelectorAll('.message'))
      .map(msg => msg.getAttribute('data-conversation-index'))
      .filter(idx => idx !== null);
    console.log('Available conversation indices in panel:', allIndices);
  }
}

// Deselect a table row and collapse it
function deselectTableRow(rowElement) {
  // Remove selection
  rowElement.classList.remove('row-selected');
  
  // Collapse textareas back to original size
  const textareas = rowElement.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.style.height = '';
    textarea.style.overflowY = '';
  });
  
  // Update Add Row button text
  updateAddRowButtonText(null);
}

// Update Add Row button text based on selection
function updateAddRowButtonText(selectedIndex) {
  const addRowButton = document.getElementById('addRowButton');
  if (addRowButton) {
    if (selectedIndex !== null && selectedIndex !== undefined) {
      addRowButton.textContent = '+ Add Row Below';
    } else {
      addRowButton.textContent = '+ Add Row';
    }
  }
}

// Add new row
function addNewRow() {
  // Check if there's a selected row
  const selectedRow = document.querySelector('.conversation-table-row.row-selected');
  let insertIndex = conversationData.length; // Default: add at end
  
  if (selectedRow) {
    // Get the index of the selected row
    const selectedIndex = parseInt(selectedRow.getAttribute('data-conversation-index'));
    if (!isNaN(selectedIndex)) {
      insertIndex = selectedIndex + 1; // Insert below selected row
    }
  }
  
  const newRow = {
    turn: insertIndex + 1, // For data consistency, but display uses index + 1
    speaker: 'AI Agent',
    message: '',
    system_actions: ''
  };
  
  // Insert at the specified index
  conversationData.splice(insertIndex, 0, newRow);
  
  // Update turn numbers
  conversationData.forEach((row, index) => {
    row.turn = index + 1;
  });
  
  renderConversationTable();
  
  // Scroll to new row and focus on message field
  const tbody = document.getElementById('conversationTableBody');
  const newRowElement = tbody.children[insertIndex];
  if (newRowElement) {
    newRowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Focus on message field
    const messageInput = newRowElement.querySelector('.message-textarea');
    if (messageInput) {
      setTimeout(() => messageInput.focus(), 100);
    }
  }
}

// Save conversation
async function saveConversation() {
  try {
    // Sort by turn number
    const sortedData = [...conversationData].sort((a, b) => {
      const turnA = parseInt(a.turn) || 0;
      const turnB = parseInt(b.turn) || 0;
      return turnA - turnB;
    });
    
    // Renumber turns sequentially and format system_actions
    sortedData.forEach((row, index) => {
      row.turn = index + 1;
      // Parse and reformat system_actions to ensure proper bracket syntax
      if (row.system_actions) {
        const actions = parseSystemActions(row.system_actions);
        row.system_actions = formatSystemActions(actions);
      }
    });
    
    if (!currentConversationId) {
      alert('No conversation selected');
      return;
    }
    
    const response = await fetch('/api/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: currentConversationId,
        conversationData: sortedData
      }),
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      alert(`Conversation saved successfully! ${result.count} rows saved.`);
      // Reload to get updated data
      await loadConversationEditor();
      // Reset conversation if it's running
      await resetConversation();
    } else {
      alert('Failed to save conversation: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving conversation:', error);
    alert('Failed to save conversation');
  }
}

// Escape HTML for display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Download CSV function
function downloadCsv() {
  // Sort data by turn number
  const sortedData = [...conversationData].sort((a, b) => {
    const turnA = parseInt(a.turn) || 0;
    const turnB = parseInt(b.turn) || 0;
    return turnA - turnB;
  });
  
  // Renumber turns sequentially and format system_actions
  sortedData.forEach((row, index) => {
    row.turn = index + 1;
    // Parse and reformat system_actions to ensure proper bracket syntax
    if (row.system_actions) {
      const actions = parseSystemActions(row.system_actions);
      row.system_actions = formatSystemActions(actions);
    }
  });
  
  // CSV header
  const headers = ['turn', 'speaker', 'message', 'system_actions'];
  
  // Convert data to CSV format
  const csvRows = [
    headers.join(','), // Header row
    ...sortedData.map(row => {
      // Escape values that contain commas, quotes, or newlines
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      
      return [
        escapeCsvValue(row.turn || ''),
        escapeCsvValue(row.speaker || ''),
        escapeCsvValue((row.message || '').replace(/\n/g, '\\n')), // Convert newlines to \n for CSV
        escapeCsvValue((row.system_actions || '').replace(/\n/g, '\\n')) // Convert newlines to \n for CSV
      ].join(',');
    })
  ];
  
  // Create CSV content
  const csvContent = csvRows.join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', 'conversation.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Editor button handlers
const saveConversationButton = document.getElementById('saveConversationButton');
const downloadCsvButton = document.getElementById('downloadCsvButton');
const reloadConversationButton = document.getElementById('reloadConversationButton');
const addRowButton = document.getElementById('addRowButton');

if (saveConversationButton) {
  saveConversationButton.addEventListener('click', saveConversation);
}

if (downloadCsvButton) {
  downloadCsvButton.addEventListener('click', downloadCsv);
}

if (reloadConversationButton) {
  reloadConversationButton.addEventListener('click', loadConversationEditor);
}

if (addRowButton) {
  addRowButton.addEventListener('click', addNewRow);
}

// System action button handler
const addSystemActionButton = document.getElementById('addSystemActionButton');
if (addSystemActionButton) {
  addSystemActionButton.addEventListener('click', createNewSystemAction);
}

