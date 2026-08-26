-- Fix for invoke_push_alert_v2 crashing when edge_function_url is not set
CREATE OR REPLACE FUNCTION public.invoke_push_alert_v2()
RETURNS TRIGGER AS $$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  edge_url := current_setting('app.settings.edge_function_url', true);
  service_key := current_setting('app.settings.service_role_key', true);
  
  -- If edge_url is missing or empty, skip sending the push alert instead of crashing
  IF edge_url IS NULL OR edge_url = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := edge_url || '/send-push-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'type', TG_TABLE_NAME,
      'action', TG_OP,
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_net is not installed or settings are missing. Push alert skipped.';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
