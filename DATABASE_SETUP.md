# Database Setup Guide

This guide will help you set up the Supabase PostgreSQL database for the Message Sim Engage application.

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in your project details:
   - Name: `message-sim-engage` (or your preferred name)
   - Database Password: Choose a strong password (save this!)
   - Region: Choose closest to you
4. Click "Create new project"
5. Wait for the project to be provisioned (takes 1-2 minutes)

## Step 2: Create the Database Table

1. In your Supabase project dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy and paste the entire contents of `supabase_schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. You should see "Success. No rows returned" - this means the table was created successfully

## Step 3: Import Existing Data (Optional)

If you have existing conversation data in `conversation.csv`, you can import it:

1. In the SQL Editor, click **New Query**
2. Copy and paste the entire contents of `supabase_migrate_data.sql`
3. Click **Run**
4. You should see a count of inserted rows at the bottom

**Note**: The migration script includes all 25 conversation turns from the original CSV. If you want to start fresh, you can skip this step.

## Step 4: Get Your Credentials

1. In your Supabase project dashboard, go to **Settings** → **API** (left sidebar)
2. You'll need two values:
   - **Project URL**: Found under "Project URL" (e.g., `https://xxxxx.supabase.co`)
   - **anon public key**: Found under "Project API keys" → "anon" → "public" (click the eye icon to reveal)

## Step 5: Configure Environment Variables

### For Local Development

Create a `.env` file in the project root:

```env
ACCESS_PASSWORD=yourpasswordhere
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### For Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `ACCESS_PASSWORD`: Your access password
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
4. Click **Save**

## Step 6: Verify Setup

1. In Supabase, go to **Table Editor** (left sidebar)
2. You should see the `conversation` table
3. Click on it to view the table structure and any imported data

## Troubleshooting

### "relation 'conversation' does not exist"
- Make sure you ran the `supabase_schema.sql` script successfully
- Check the SQL Editor for any error messages

### "permission denied for table conversation"
- Make sure you're using the `anon` key (not the `service_role` key)
- Check that Row Level Security (RLS) is not enabled on the table (it shouldn't be for this simple setup)

### "Failed to load conversation from database"
- Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check that the table exists and has data
- Check server logs for detailed error messages

## Database Schema

The `conversation` table has the following structure:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Auto-incrementing unique identifier |
| turn | INTEGER | Sequential turn number (1, 2, 3, ...) |
| speaker | VARCHAR(50) | Either "AI Agent" or "Merchant" |
| message | TEXT | The message text (supports newlines) |
| system_actions | TEXT | System actions in bracket syntax |
| created_at | TIMESTAMP | When the record was created |
| updated_at | TIMESTAMP | When the record was last updated |

## Security Notes

- The `anon` key is safe to use in client-side code, but for this application, it's only used server-side
- Row Level Security (RLS) is not enabled by default - the table is accessible to anyone with the anon key
- For production, consider enabling RLS if you need additional security
- The password protection in the application provides basic access control

