-- Add new enum values outside of a transaction block
ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'TASK_CREATE';
ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'TASK_DELETE';

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.log_task_audit_events()
RETURNS trigger AS $$
DECLARE
    v_user_id UUID;
    v_action_type audit_action_type;
    v_description TEXT;
BEGIN
    -- Attempt to get the user ID from the Supabase auth context
    v_user_id := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'TASK_CREATE';
        v_description := 'Task created: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        
        -- Insert into audit log
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        v_action_type := 'TASK_UPDATE';
        v_description := 'Task updated: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        
        -- Insert into audit log
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'TASK_DELETE';
        v_description := 'Task deleted: ' || OLD.title || ' (ID: ' || OLD.id || ')';
        
        -- Insert into audit log
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        
        RETURN OLD;
    END IF;
    
    RETURN NULL; -- result is ignored since this is an AFTER trigger
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow idempotency
DROP TRIGGER IF EXISTS tasks_audit_trigger ON public.tasks;

-- Create the trigger
CREATE TRIGGER tasks_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_audit_events();
