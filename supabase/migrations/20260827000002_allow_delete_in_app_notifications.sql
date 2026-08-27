-- Migration: 20260827000002_allow_delete_in_app_notifications.sql
-- Description: Add DELETE policy for in_app_notifications and ensure users can manage their notifications completely.

-- 1. Enable DELETE policy for users
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can delete own notifications"
ON public.in_app_notifications FOR DELETE
USING (auth.uid() = user_id);

-- 2. Ensure ALL/UPDATE/INSERT policies are completely open for own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can view own notifications"
ON public.in_app_notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update own notifications"
ON public.in_app_notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Mark existing legacy notifications that are orphaned or read
-- Clean up notifications table index for fast querying
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread ON public.in_app_notifications(user_id, is_read, updated_at DESC);
