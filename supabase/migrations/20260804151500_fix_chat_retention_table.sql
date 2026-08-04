-- Update the cron job to use the correct table 'chat_messages' instead of 'messages'
SELECT cron.schedule(
  'cleanup-old-chats',
  '0 0 * * *',
  $$
  DELETE FROM public.chat_messages 
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
