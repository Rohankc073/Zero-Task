-- Migration: 20260820000005_strict_push_notifications.sql
-- Description: Sets up the strict 4-event push notification architecture with a multi-device token model.

-- 1. Push Token Table
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- Enable RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.user_push_tokens;
    DROP POLICY IF EXISTS "Users can view own push tokens" ON public.user_push_tokens;
    DROP POLICY IF EXISTS "Users can update own push tokens" ON public.user_push_tokens;
    DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.user_push_tokens;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can insert own push tokens"
ON public.user_push_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own push tokens"
ON public.user_push_tokens FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
ON public.user_push_tokens FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push tokens"
ON public.user_push_tokens FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. Drop old generic in-app notification triggers to decouple alerts from push
DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_new_notification_send_push ON public.in_app_notifications;
    DROP TRIGGER IF EXISTS on_new_notification_send_push ON public.notifications;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- 3. Unified Push Trigger Function
CREATE OR REPLACE FUNCTION public.invoke_push_alert_v2()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.edge_function_url', true) || '/send-push-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
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

-- 4. Event A: Task Assigned
DROP TRIGGER IF EXISTS trg_push_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_push_task_assignee
AFTER INSERT ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert_v2();

-- 5. Event B: Meeting Scheduled (Trigger on participant addition)
DROP TRIGGER IF EXISTS trg_push_meeting_participant ON public.meeting_participants;
CREATE TRIGGER trg_push_meeting_participant
AFTER INSERT ON public.meeting_participants
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert_v2();

-- 6. Events C & D: New Chat / New Message
DROP TRIGGER IF EXISTS trg_push_chat_message ON public.chat_messages;
CREATE TRIGGER trg_push_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert_v2();

NOTIFY pgrst, 'reload schema';
