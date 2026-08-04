-- Migration: 20260804000002_fix_push_alert_function.sql
-- Description: Hardcode the Supabase URL and Service Role Key since they are null in the database settings.

CREATE OR REPLACE FUNCTION public.invoke_push_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- We use pg_net extension to make async HTTP POST requests
  -- Make sure pg_net is enabled
  
  PERFORM net.http_post(
    url := 'https://tevugdwficrmbmfoqpub.supabase.co/functions/v1/send-push-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRldnVnZHdmaWNybWJtZm9xcHViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzMDQwOSwiZXhwIjoyMTAwOTA2NDA5fQ.PwcLDvqrvTcx6jT8T8-w-_ZVkZWA0BEW6OGP3jaihoY'
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  
  RETURN NEW;
EXCEPTION
  WHEN undefined_function THEN
    -- Fallback if pg_net is not installed or current_setting fails
    RAISE NOTICE 'pg_net is not installed or settings are missing. Push alert skipped.';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
