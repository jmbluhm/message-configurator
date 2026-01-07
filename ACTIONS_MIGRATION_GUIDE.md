# Actions Migration Guide

This guide explains the migration from the old `system_actions` column format to the new `message_actions` table structure.

## Overview

The actions system has been expanded to support:
- **System Actions**: Actions associated with AI Agent messages
- **User Actions**: Actions associated with Merchant messages
- **Individual Action Records**: Each action is now stored as a separate record in the `message_actions` table
- **Message Association**: Actions clearly show which message they're associated with

## Database Changes

### New Table: `message_actions`

```sql
CREATE TABLE message_actions (
    id UUID PRIMARY KEY,
    conversation_message_id INTEGER REFERENCES conversation_message(id),
    action_content TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Migration Process

1. **Run the migration script**: Execute `supabase_migration_actions_table.sql` in your Supabase SQL Editor
2. **Verify migration**: The script includes a verification query to check that all actions were migrated correctly
3. **Data preservation**: All existing actions from AI Agent messages are migrated with zero data loss

## Application Changes

### Backend (`server.js`)

- **`loadConversation()`**: Now loads actions from `message_actions` table and groups them by message
- **`/api/conversation` GET**: Returns actions as an array with `id` and `content` for each action
- **`/api/conversation` POST**: Saves actions to `message_actions` table, supports both new format (actions array) and legacy format (system_actions string) for backward compatibility

### Frontend (`app.js`)

- **Message Codes**: 
  - AI Agent messages: `A1`, `A2`, `A3`, etc.
  - Merchant messages: `M1`, `M2`, `M3`, etc.
  - Actions: `A1.1`, `A1.2`, `M1.1`, etc.

- **Actions Panel** (formerly "System Notes"):
  - Shows both System Actions and User Actions
  - Each action displays:
    - Type label (System/User)
    - Message code (e.g., `A1.1`)
    - Action content
    - Timestamp

- **Action Management**:
  - Click any action to edit it
  - Click message code to highlight related message
  - Add actions to any message (not just AI Agent)
  - Delete actions individually

### UI Changes (`index.html`)

- **Panel renamed**: "System Notes" → "Actions"
- **Button renamed**: "+ Add System Action" → "+ Add Action"
- **Table column**: "System Actions" → "Actions" (shows action count, not editable textarea)

## Usage

### Adding Actions

1. Click on any message in the Conversation panel
2. Click "+ Add Action" button in the Actions panel
3. Action will be created for the most recent message
4. Edit the action content immediately

### Editing Actions

1. Click on any action in the Actions panel
2. Modify the content in the textarea
3. Click "Save" or press Ctrl/Cmd + Enter
4. Click "Delete" to remove an action

### Viewing Actions

- Actions are displayed in the Actions panel
- System Actions have a "System" label
- User Actions have a "User" label
- Click the message code (e.g., `A1.1`) to highlight the associated message
- Actions are sorted by creation time

## Backward Compatibility

The system maintains backward compatibility with the old `system_actions` column format:
- When loading data, it checks for both `actions` array and `system_actions` string
- When saving data, it accepts both formats
- Legacy data is automatically migrated when saved

## Data Migration

The migration script:
1. Creates the `message_actions` table
2. Parses existing `system_actions` strings (bracket syntax)
3. Creates individual action records for each action
4. Associates actions with their message records
5. Preserves all action content with zero data loss

## Notes

- The `system_actions` column in `conversation_message` table is not removed (for backward compatibility)
- New actions are only stored in the `message_actions` table
- The conversation editor table shows action counts but actions are managed in the Actions panel
- Message codes use prefixes: `A` for AI Agent, `M` for Merchant

