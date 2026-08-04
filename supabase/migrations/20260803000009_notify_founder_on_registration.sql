-- Migration: 20260803000009_notify_founder_on_registration.sql
-- Description: Creates a trigger to notify Founders when a new user signs up (is_approved = false).

CREATE OR REPLACE FUNCTION public.trigger_new_user_registration_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    founder_rec RECORD;
BEGIN
    -- Only trigger on new inserts where the user is pending approval
    IF TG_OP = 'INSERT' AND NEW.is_approved = false AND NEW.role != 'Founder' THEN
        -- Find all users with the 'Founder' role
        FOR founder_rec IN SELECT id FROM public.users WHERE role = 'Founder' LOOP
            -- Insert a notification for each founder
            INSERT INTO public.in_app_notifications (user_id, title, message)
            VALUES (
                founder_rec.id,
                'New Registration Request',
                'A new ' || NEW.role || ' registration request is pending from: ' || NEW.email
            );
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Bind the trigger to users
DROP TRIGGER IF EXISTS tr_new_user_registration_notification ON public.users;
CREATE TRIGGER tr_new_user_registration_notification
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_new_user_registration_notification();
