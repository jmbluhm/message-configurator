# Multiple Conversations Setup Guide

This guide will help you migrate your database to support multiple conversations.

## SQL Migration Steps

### Step 1: Run the Migration Script

In your Supabase SQL Editor, run the entire contents of `supabase_migration_multiple_conversations.sql`. This script will:

1. Rename the `conversation` table to `conversation_message`
2. Create a new `conversation` table with UUID primary key
3. Add `conversation_id` foreign key to `conversation_message`
4. Create a default conversation and migrate all existing data to it
5. Set up indexes and triggers

**Important**: Make sure you have a backup of your data before running this migration!

### Step 2: Verify the Migration

After running the migration, verify it worked by running this query:

```sql
SELECT 
    c.id as conversation_id,
    c.name as conversation_name,
    COUNT(cm.id) as message_count
FROM conversation c
LEFT JOIN conversation_message cm ON c.id = cm.conversation_id
GROUP BY c.id, c.name
ORDER BY c.created_at;
```

You should see at least one conversation (the "Default Conversation") with all your existing messages.

## What Changed

### Database Schema

**New `conversation` table:**
- `id` (UUID, primary key)
- `name` (VARCHAR(255))
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Renamed `conversation_message` table:**
- All original columns (`id`, `turn`, `speaker`, `message`, `system_actions`, `created_at`, `updated_at`)
- New `conversation_id` (UUID, foreign key to `conversation.id`)

### Application Changes

1. **Conversation Selector**: Dropdown in the header to select between conversations
2. **Create New Conversation**: Button to create a new empty conversation
3. **Modal Dialog**: Prompts for conversation name when creating new conversations
4. **API Updates**: All API endpoints now require `conversationId` parameter

### API Endpoints

**New endpoints:**
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create a new conversation

**Updated endpoints:**
- `POST /api/next-message` - Now requires `conversationId` in body
- `POST /api/reset` - Now requires `conversationId` in body
- `GET /api/conversation` - Now requires `conversationId` query parameter
- `POST /api/conversation` - Now requires `conversationId` and `conversationData` in body

## Usage

1. **Select a Conversation**: Use the dropdown in the header to switch between conversations
2. **Create New Conversation**: Click "+ New Conversation" button, enter a name, and click "Create"
3. **Edit Conversations**: Each conversation maintains its own state and can be edited independently
4. **Save Changes**: Changes are saved per conversation

## Troubleshooting

### "No conversations" message
- Make sure you ran the migration script successfully
- Check that the `conversation` table exists and has at least one row

### "conversationId is required" errors
- Make sure a conversation is selected in the dropdown
- Check browser console for any JavaScript errors

### Data not loading
- Verify the `conversation_message` table has the `conversation_id` column
- Check that existing messages have a valid `conversation_id` set

