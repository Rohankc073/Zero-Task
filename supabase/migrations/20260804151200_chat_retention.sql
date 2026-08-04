-- Ensure pg_cron extension is active (usually on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a scheduled job that runs every day at midnight (0 0 * * *)
-- to delete messages older than 30 days
SELECT cron.schedule(
  'cleanup-old-chats',
  '0 0 * * *',
  $$
  DELETE FROM public.messages 
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
