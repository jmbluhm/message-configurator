# Message Sim Engage - Chat Simulation App

A simple Node.js web application that simulates the Recurly Engage setup conversation flow. The app features a chat interface where AI Agent messages are scripted and Merchant messages are auto-filled for easy progression through the conversation.

## Features

- **Standard Chat Interface**: Modern, responsive chat UI similar to LLM conversational apps
- **Auto-fill Messages**: Next Merchant message is automatically filled in the input field (editable before sending)
- **Scripted Responses**: AI Agent always responds with the next message from the script, regardless of user input
- **Visual Distinction**: AI and Merchant messages are styled differently for clarity
- **System Notes Panel**: Separate panel showing system actions (API calls, data operations) extracted from messages
- **CSV-Based Configuration**: Conversation flow is stored in CSV format for easy editing
- **Built-in Editor**: Table editor to modify conversation flow directly in the app

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

1. When the page loads, the first AI Agent message will appear automatically
2. The next Merchant message will be auto-filled in the input field
3. You can edit the auto-filled message or send it as-is
4. Click "Send" or press Enter to send your message
5. The AI Agent will always respond with the next message from the script
6. Continue through the conversation - each Merchant message will be auto-filled after each AI response

## Project Structure

```
message_sim_engage/
├── package.json          # Node.js dependencies
├── server.js             # Express server with API endpoints
├── conversation.csv      # Conversation flow data (CSV format)
├── script.js             # Legacy conversation script (deprecated)
├── public/               # Static files
│   ├── index.html        # Main chat interface
│   ├── styles.css        # Chat UI styling
│   └── app.js            # Frontend chat logic
└── README.md             # This file
```

## CSV Format

The conversation flow is stored in `conversation.csv` with the following columns:

- **turn**: Sequential turn number (1, 2, 3, ...)
- **speaker**: Either "AI Agent" or "Merchant"
- **message**: The message text (supports newlines using `\n`, markdown, structured blocks)
- **system_actions**: Comma-separated list of system actions (e.g., "Agent calls API, Agent fetches config")
- **auto_fill**: "true" or "false" - whether merchant message should be auto-filled

### CSV Format Examples

```csv
turn,speaker,message,system_actions,auto_fill
1,AI Agent,"Hello! How can I help?",,true
2,Merchant,"I need help with setup.",,false
3,AI Agent,"Let me check your settings...\n\nHere's what I found.","Agent calls API to check settings",true
```

**Notes:**
- Messages with newlines should use `\n` (will be converted to actual newlines)
- System actions are comma-separated (e.g., "Action 1, Action 2, Action 3")
- Empty cells are allowed (use empty string `""`)
- Structured blocks (like "Campaign Overview:") are supported in message text

## Conversation Editor

The app includes a built-in table editor to modify the conversation flow:

1. **Open Editor**: Click the ⚙️ button in the bottom-left corner
2. **Edit Rows**: Click any cell to edit
3. **Add Row**: Click "+ Add Row" button
4. **Delete Row**: Click 🗑️ button on any row
5. **Save Changes**: Click "💾 Save Changes" to save to CSV
6. **Reload**: Click "↻ Reload" to reload from CSV (discards unsaved changes)

The editor allows you to:
- Modify message text, speaker, system actions, and auto-fill settings
- Add new conversation turns
- Delete existing turns
- Reorder turns (by editing turn numbers)

After saving, the conversation will reload and you can test the new flow by clicking "Reset".

## API Endpoints

- `POST /api/next-message`: Returns the next AI Agent message, Merchant message, and system actions
- `POST /api/reset`: Resets the conversation to the beginning
- `GET /api/conversation`: Returns the full conversation data as JSON
- `POST /api/conversation`: Saves conversation data to CSV

## Notes

- The conversation state is maintained in-memory on the server and resets when the server restarts
- The app always responds with the next AI message in sequence, regardless of what the user types
- Merchant messages are pre-filled but can be edited before sending
- System actions are automatically extracted and displayed in the System Notes panel
- Changes to the CSV file require a server restart or using the built-in editor's save function

