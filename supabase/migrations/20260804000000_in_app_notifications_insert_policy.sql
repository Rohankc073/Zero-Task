-- Migration: 20260804000000_in_app_notifications_insert_policy.sql
-- Description: Adds INSERT policy for users to create their own notifications, required for the QA testing flow.

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can insert own notifications" ON public.in_app_notifications;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Users can insert their own notifications
CREATE POLICY "Users can insert own notifications"
ON public.in_app_notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);
