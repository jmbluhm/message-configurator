-- Migration script to support multiple conversations
-- Run this after you have data in the conversation table

-- Step 1: Rename the existing conversation table to conversation_message
ALTER TABLE conversation RENAME TO conversation_message;

-- Step 2: Create the new conversation table with UUID primary key
CREATE TABLE IF NOT EXISTS conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Add conversation_id column to conversation_message table
ALTER TABLE conversation_message 
ADD COLUMN conversation_id UUID REFERENCES conversation(id) ON DELETE CASCADE;

-- Step 4: Create a default conversation and migrate existing data
-- First, create a default conversation
INSERT INTO conversation (id, name) 
VALUES (gen_random_uuid(), 'Default Conversation')
RETURNING id;

-- Step 5: Update all existing conversation_message records to use the default conversation
-- Note: Replace 'YOUR_DEFAULT_CONVERSATION_UUID' with the UUID returned from the previous INSERT
-- Or use this approach:
DO $$
DECLARE
    default_conv_id UUID;
BEGIN
    -- Create default conversation
    INSERT INTO conversation (name) 
    VALUES ('Default Conversation')
    RETURNING id INTO default_conv_id;
    
    -- Update all existing messages to reference this conversation
    UPDATE conversation_message 
    SET conversation_id = default_conv_id 
    WHERE conversation_id IS NULL;
    
    -- Make conversation_id NOT NULL after migration
    ALTER TABLE conversation_message 
    ALTER COLUMN conversation_id SET NOT NULL;
END $$;

-- Step 6: Create index on conversation_id for faster queries
CREATE INDEX IF NOT EXISTS idx_conversation_message_conversation_id 
ON conversation_message(conversation_id);

-- Step 7: Update the updated_at trigger function (if it doesn't exist for conversation table)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 8: Create trigger for conversation table updated_at
DROP TRIGGER IF EXISTS update_conversation_updated_at ON conversation;
CREATE TRIGGER update_conversation_updated_at 
    BEFORE UPDATE ON conversation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Verify the migration
SELECT 
    c.id as conversation_id,
    c.name as conversation_name,
    COUNT(cm.id) as message_count
FROM conversation c
LEFT JOIN conversation_message cm ON c.id = cm.conversation_id
GROUP BY c.id, c.name
ORDER BY c.created_at;

