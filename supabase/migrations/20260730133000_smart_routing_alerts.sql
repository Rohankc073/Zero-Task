-- Migration: 20260730133000_smart_routing_alerts.sql
-- Description: Adds actionable fields to in_app_notifications and upgrades the registration trigger logic.

-- 1. Modify in_app_notifications
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system';

-- 2. Drop the old trigger and function
DROP TRIGGER IF EXISTS tr_management_notification ON public.registration_requests;
DROP FUNCTION IF EXISTS public.trigger_management_notification;

-- 3. Create the new dynamic routing function
CREATE OR REPLACE FUNCTION public.route_registration_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_roles public.user_role_enum[];
BEGIN
    -- Only trigger on new pending registration requests
    IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
        
        -- Determine hierarchy routing based on requested role
        CASE NEW.requested_role
            WHEN 'Employee' THEN
                target_roles := ARRAY['Manager', 'Department Head']::public.user_role_enum[];
            WHEN 'Manager' THEN
                target_roles := ARRAY['Founder', 'Department Head']::public.user_role_enum[];
            WHEN 'Department Head' THEN
                target_roles := ARRAY['Founder']::public.user_role_enum[];
            WHEN 'Founder' THEN
                target_roles := ARRAY['Founder']::public.user_role_enum[];
            ELSE
                target_roles := ARRAY['Founder']::public.user_role_enum[];
        END CASE;

        -- Insert notification for all matching target roles
        INSERT INTO public.in_app_notifications (user_id, title, message, action_url, type)
        SELECT 
            id,
            'New ' || NEW.requested_role || ' Request',
            NEW.email || ' has requested access to ZeroTask.',
            '/approvals',
            'registration_request'
        FROM public.users 
        WHERE role = ANY(target_roles);
        
    END IF;
    
    RETURN NEW;
END;
$$;

-- 4. Bind the new trigger to registration_requests
DROP TRIGGER IF EXISTS tr_route_registration_alert ON public.registration_requests;
CREATE TRIGGER tr_route_registration_alert
    AFTER INSERT ON public.registration_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.route_registration_alert();
