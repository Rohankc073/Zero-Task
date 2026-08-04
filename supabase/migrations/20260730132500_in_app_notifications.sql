-- Migration: 20260730132500_in_app_notifications.sql
-- Description: Creates the in_app_notifications table, RLS, push_token column, and management triggers.

-- 1. Add push_token to public.users if it doesn't exist
DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN push_token TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 2. Create in_app_notifications table
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own notifications" ON public.in_app_notifications;
    DROP POLICY IF EXISTS "Users can update own notifications" ON public.in_app_notifications;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.in_app_notifications FOR SELECT
USING (auth.uid() = user_id);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON public.in_app_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- (System triggers bypass RLS to insert)


-- 4. Automated Alert Trigger for Management
CREATE OR REPLACE FUNCTION public.trigger_management_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    founder_rec RECORD;
BEGIN
    -- Only trigger on new pending registration requests
    IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
        -- Find all users with the 'Founder' role
        FOR founder_rec IN SELECT id FROM public.users WHERE role = 'Founder' LOOP
            -- Insert a notification for each founder
            INSERT INTO public.in_app_notifications (user_id, title, message)
            VALUES (
                founder_rec.id,
                'New Registration Request',
                'A new ' || NEW.requested_role || ' registration request is pending from: ' || NEW.email
            );
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Bind the trigger to registration_requests
DROP TRIGGER IF EXISTS tr_management_notification ON public.registration_requests;
CREATE TRIGGER tr_management_notification
    AFTER INSERT ON public.registration_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_management_notification();
