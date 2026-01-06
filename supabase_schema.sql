-- Create conversation table
-- This table stores the conversation flow data

CREATE TABLE IF NOT EXISTS conversation (
    id SERIAL PRIMARY KEY,
    turn INTEGER NOT NULL,
    speaker VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    system_actions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on turn for faster ordering
CREATE INDEX IF NOT EXISTS idx_conversation_turn ON conversation(turn);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_conversation_updated_at 
    BEFORE UPDATE ON conversation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE conversation IS 'Stores conversation flow data for the message simulation tool';

