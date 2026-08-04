-- Migration: 20260804000001_fix_push_notification_trigger.sql
-- Description: Fix push notification trigger to attach to in_app_notifications instead of notifications

-- Drop the old trigger if it somehow exists (likely doesn't since table doesn't exist, but good practice)
DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_new_notification_send_push ON public.notifications;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- Create the trigger on the correct table: in_app_notifications
DROP TRIGGER IF EXISTS on_new_notification_send_push ON public.in_app_notifications;

CREATE TRIGGER on_new_notification_send_push
AFTER INSERT ON public.in_app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert();
