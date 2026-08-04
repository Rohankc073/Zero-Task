-- Add trigger to notifications table to hit the send-push-alert edge function
-- Replace the URL with your actual project URL once deployed.

CREATE OR REPLACE FUNCTION public.invoke_push_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- We use pg_net extension to make async HTTP POST requests
  -- Make sure pg_net is enabled
  
  PERFORM net.http_post(
    url := current_setting('app.settings.edge_function_url', true) || '/send-push-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
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

-- Create the trigger on notifications table
DROP TRIGGER IF EXISTS on_new_notification_send_push ON public.notifications;

CREATE TRIGGER on_new_notification_send_push
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert();
