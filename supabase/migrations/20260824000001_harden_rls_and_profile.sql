-- Migration: 20260824000001_harden_rls_and_profile.sql
-- Description: Re-adds the missing RLS policy for users to update their own profile and hardens the audit log trigger.

-- 1. Restore the missing policy allowing users to update their own profile
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can update their own profile" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 2. Harden the audit_logs trigger to gracefully handle null auth.uid()
CREATE OR REPLACE FUNCTION public.log_task_audit_events()
RETURNS trigger AS $$
DECLARE
    v_user_id UUID;
    v_action_type audit_action_type;
    v_description TEXT;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        v_user_id := COALESCE(NEW.created_by, OLD.created_by);
    END IF;
    
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'TASK_CREATE';
        v_description := 'Task created: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        
        IF v_user_id IS NOT NULL THEN
            INSERT INTO public.audit_logs (user_id, action_type, description)
            VALUES (v_user_id, v_action_type, v_description);
        END IF;
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Skip noisy updates like purely progress changes
        IF OLD.progress IS DISTINCT FROM NEW.progress AND OLD.status = NEW.status AND OLD.title = NEW.title AND OLD.description = NEW.description THEN
            RETURN NEW;
        END IF;

        v_action_type := 'TASK_UPDATE';
        v_description := 'Task updated: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        
        IF v_user_id IS NOT NULL THEN
            INSERT INTO public.audit_logs (user_id, action_type, description)
            VALUES (v_user_id, v_action_type, v_description);
        END IF;
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'TASK_DELETE';
        v_description := 'Task deleted: ' || OLD.title || ' (ID: ' || OLD.id || ')';
        
        IF v_user_id IS NOT NULL THEN
            INSERT INTO public.audit_logs (user_id, action_type, description)
            VALUES (v_user_id, v_action_type, v_description);
        END IF;
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
