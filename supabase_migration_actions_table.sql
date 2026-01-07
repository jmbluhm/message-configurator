-- Migration script to create message_actions table and migrate existing data
-- This migration expands actions to support both System Actions (AI Agent) and User Actions (Merchant)

-- Step 1: Create the message_actions table
CREATE TABLE IF NOT EXISTS message_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_message_id INTEGER NOT NULL REFERENCES conversation_message(id) ON DELETE CASCADE,
    action_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create index on conversation_message_id for faster queries
CREATE INDEX IF NOT EXISTS idx_message_actions_conversation_message_id 
ON message_actions(conversation_message_id);

-- Step 3: Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_message_actions_created_at 
ON message_actions(created_at);

-- Step 4: Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_message_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 5: Create trigger for message_actions table updated_at
DROP TRIGGER IF EXISTS update_message_actions_updated_at ON message_actions;
CREATE TRIGGER update_message_actions_updated_at 
    BEFORE UPDATE ON message_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_message_actions_updated_at();

-- Step 6: Migrate existing system_actions data to message_actions table
-- This function parses the bracket syntax and creates individual action records
DO $$
DECLARE
    msg_record RECORD;
    action_text TEXT;
    actions_array TEXT[];
    bracket_depth INTEGER;
    current_action TEXT;
    i INTEGER;
    char CHAR;
BEGIN
    -- Loop through all conversation_message records that have system_actions
    FOR msg_record IN 
        SELECT id, system_actions, speaker
        FROM conversation_message
        WHERE system_actions IS NOT NULL 
        AND system_actions != ''
        AND speaker = 'AI Agent'  -- Only migrate actions from AI Agent messages (current limitation)
    LOOP
        -- Parse system_actions string with bracket syntax: [Action 1, with comma],[Action 2]
        action_text := msg_record.system_actions;
        actions_array := ARRAY[]::TEXT[];
        bracket_depth := 0;
        current_action := '';
        
        -- Parse the bracket syntax
        FOR i IN 1..length(action_text) LOOP
            char := substring(action_text, i, 1);
            
            IF char = '[' THEN
                bracket_depth := bracket_depth + 1;
                current_action := current_action || char;
            ELSIF char = ']' THEN
                bracket_depth := bracket_depth - 1;
                current_action := current_action || char;
            ELSIF char = ',' AND bracket_depth = 0 THEN
                -- This comma is outside brackets, so it separates actions
                IF trim(current_action) != '' THEN
                    actions_array := array_append(actions_array, trim(current_action));
                END IF;
                current_action := '';
            ELSE
                current_action := current_action || char;
            END IF;
        END LOOP;
        
        -- Add the last action
        IF trim(current_action) != '' THEN
            actions_array := array_append(actions_array, trim(current_action));
        END IF;
        
        -- Insert each action as a separate record in message_actions table
        -- Strip brackets from action content for storage (they're only needed for parsing)
        FOR i IN 1..array_length(actions_array, 1) LOOP
            action_text := actions_array[i];
            -- Remove brackets if present
            IF action_text LIKE '[%]' THEN
                action_text := substring(action_text, 2, length(action_text) - 2);
            END IF;
            
            -- Insert the action
            INSERT INTO message_actions (conversation_message_id, action_content)
            VALUES (msg_record.id, trim(action_text));
        END LOOP;
    END LOOP;
END $$;

-- Step 7: Verify the migration
-- Check that all actions were migrated correctly
SELECT 
    cm.id as message_id,
    cm.speaker,
    cm.system_actions as original_actions,
    COUNT(ma.id) as migrated_action_count,
    array_agg(ma.action_content ORDER BY ma.created_at) as migrated_actions
FROM conversation_message cm
LEFT JOIN message_actions ma ON cm.id = ma.conversation_message_id
WHERE cm.system_actions IS NOT NULL AND cm.system_actions != ''
GROUP BY cm.id, cm.speaker, cm.system_actions
ORDER BY cm.id;

-- Step 8: Add comment to table
COMMENT ON TABLE message_actions IS 'Stores individual actions associated with conversation messages. Actions can be System Actions (for AI Agent messages) or User Actions (for Merchant messages).';

