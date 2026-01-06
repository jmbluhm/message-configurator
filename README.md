# Message Sim Engage - Chat Simulation App

A simple Node.js web application that simulates the Recurly Engage setup conversation flow. The app features a chat interface where AI Agent messages are scripted and Merchant messages are auto-filled for easy progression through the conversation.

## Features

- **Standard Chat Interface**: Modern, responsive chat UI similar to LLM conversational apps
- **Auto-fill Messages**: Next Merchant message is automatically filled in the input field (editable before sending)
- **Scripted Responses**: AI Agent always responds with the next message from the script, regardless of user input
- **Visual Distinction**: AI and Merchant messages are styled differently for clarity
- **System Notes Panel**: Separate panel showing system actions (API calls, data operations) extracted from messages
- **Database-Backed Storage**: Conversation flow is stored in Supabase PostgreSQL database
- **Built-in Editor**: Table editor to modify conversation flow directly in the app
- **Password Protection**: Simple password authentication to protect access to the application

## Setup

### Prerequisites

- Node.js installed
- A Supabase account and project
- Supabase database with the conversation table created (see Database Setup below)

### Database Setup

1. **Create Supabase Project**: Go to [supabase.com](https://supabase.com) and create a new project

2. **Run SQL Schema**: In your Supabase SQL Editor, run the contents of `supabase_schema.sql`:
   ```sql
   -- See supabase_schema.sql file for the complete schema
   ```

3. **Migrate Data** (optional): If you have existing CSV data, run `supabase_migrate_data.sql` in the SQL Editor to import it

4. **Get Credentials**: 
   - Go to Project Settings → API
   - Copy your `Project URL` (SUPABASE_URL)
   - Copy your `anon public` key (SUPABASE_ANON_KEY)

### Local Development Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Create `.env` file** in the project root:
```env
ACCESS_PASSWORD=yourpasswordhere
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

3. **Start the server**:
```bash
npm start
```

4. **Open your browser** and navigate to:
```
http://localhost:3000
```

5. **Enter password** when prompted (use the password from your `.env` file)

### Vercel Deployment

1. **Add Environment Variables** in Vercel:
   - `ACCESS_PASSWORD`: Your access password
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key

2. **Deploy**: Push to your connected Git repository or use Vercel CLI

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
├── package.json              # Node.js dependencies
├── server.js                 # Express server with API endpoints
├── conversation.csv          # Legacy CSV file (now using database)
├── supabase_schema.sql       # Database schema SQL
├── supabase_migrate_data.sql # Data migration SQL
├── script.js                 # Legacy conversation script (deprecated)
├── public/                   # Static files
│   ├── index.html            # Main chat interface
│   ├── styles.css            # Chat UI styling
│   └── app.js                # Frontend chat logic
└── README.md                 # This file
```

## Database Schema

The conversation flow is stored in a PostgreSQL database table with the following structure:

- **id**: Primary key (auto-increment)
- **turn**: Sequential turn number (1, 2, 3, ...)
- **speaker**: Either "AI Agent" or "Merchant"
- **message**: The message text (supports newlines, markdown, structured blocks)
- **system_actions**: System actions in bracket syntax (e.g., "[Action 1],[Action 2]")
- **created_at**: Timestamp when record was created
- **updated_at**: Timestamp when record was last updated

### System Actions Format

System actions use bracket syntax where commas inside brackets are preserved:
- `[Action 1, with comma],[Action 2]` → Two actions: "Action 1, with comma" and "Action 2"
- Commas outside brackets separate different actions
- Empty system_actions are stored as NULL

**Notes:**
- Messages support newlines (stored as actual newlines in database)
- System actions use bracket syntax for complex actions with commas
- The database automatically tracks created_at and updated_at timestamps

## Conversation Editor

The app includes a built-in table editor to modify the conversation flow:

1. **Open Editor**: Click the ⚙️ button in the bottom-left corner
2. **Edit Rows**: Click any cell to edit
3. **Add Row**: Click "+ Add Row" button
4. **Delete Row**: Click 🗑️ button on any row
5. **Save Changes**: Click "💾 Save Changes" to save to CSV
6. **Reload**: Click "↻ Reload" to reload from CSV (discards unsaved changes)

The editor allows you to:
- Modify message text, speaker, and system actions
- Add new conversation turns
- Delete existing turns
- Reorder turns (by editing turn numbers)

After saving, the conversation will reload from the database and you can test the new flow by clicking "Reset".

## API Endpoints

- `POST /api/auth`: Authenticates user with password (sets session cookie)
- `POST /api/next-message`: Returns the next AI Agent message, Merchant message, and system actions
- `POST /api/reset`: Resets the conversation to the beginning
- `GET /api/conversation`: Returns the full conversation data as JSON from database
- `POST /api/conversation`: Saves conversation data to database

## Environment Variables

Required environment variables:

- `ACCESS_PASSWORD`: Password required to access the application
- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_ANON_KEY`: Your Supabase anon/public key

Optional:
- `NODE_ENV`: Set to `production` for production deployments (enables secure cookies)

## Notes

- The conversation state is maintained in-memory on the server and resets when the server restarts
- Conversation data is persisted in Supabase PostgreSQL database
- The app always responds with the next AI message in sequence, regardless of what the user types
- Merchant messages are pre-filled but can be edited before sending
- System actions are automatically extracted and displayed in the System Notes panel
- Changes are saved directly to the database and take effect immediately
- Password authentication uses httpOnly cookies for security

