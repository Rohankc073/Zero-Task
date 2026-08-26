-- Migration: 20260825000015_fix_task_delete_audit_logs.sql
-- Description: Fixes task deletion by altering audit_logs task_id foreign key to ON DELETE SET NULL and preventing task_assignee audit trigger from failing during task cascade deletion.

BEGIN;

-- 1. Ensure task_id column exists and has ON DELETE SET NULL constraint
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS task_id UUID;

DO $$ 
BEGIN
    -- Drop existing foreign key constraint if present
    ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_task_id_fkey;
    
    -- Re-add constraint with ON DELETE SET NULL so historical audit logs remain valid when a task is deleted
    ALTER TABLE public.audit_logs
        ADD CONSTRAINT audit_logs_task_id_fkey
        FOREIGN KEY (task_id) REFERENCES public.tasks(id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN undefined_object THEN null;
    WHEN others THEN null;
END $$;

-- 2. Update log_task_assignee_audit_events trigger function
CREATE OR REPLACE FUNCTION public.log_task_assignee_audit_events()
RETURNS trigger AS $$
DECLARE
    v_user_id UUID;
    v_action_type audit_action_type;
    v_description TEXT;
    v_assignee_name TEXT;
    v_task_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'TASK_UPDATE';
        SELECT full_name INTO v_assignee_name FROM public.users WHERE id = NEW.user_id;
        v_description := 'User assigned to task: ' || COALESCE(v_assignee_name, 'Unknown') || ' (User ID: ' || NEW.user_id || ')';
        
        -- Check if task exists before inserting with task_id
        SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = NEW.task_id) INTO v_task_exists;
        
        IF v_task_exists THEN
            INSERT INTO public.audit_logs (task_id, user_id, action_type, description)
            VALUES (NEW.task_id, v_user_id, v_action_type, v_description);
        ELSE
            INSERT INTO public.audit_logs (user_id, action_type, description)
            VALUES (v_user_id, v_action_type, v_description);
        END IF;
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'TASK_UPDATE';
        SELECT full_name INTO v_assignee_name FROM public.users WHERE id = OLD.user_id;
        v_description := 'User removed from task: ' || COALESCE(v_assignee_name, 'Unknown') || ' (User ID: ' || OLD.user_id || ')';
        
        -- Only attempt to log assignee deletion if the parent task still exists
        -- (If the task itself is being deleted, the task deletion trigger handles the audit log)
        SELECT EXISTS(SELECT 1 FROM public.tasks WHERE id = OLD.task_id) INTO v_task_exists;
        
        IF v_task_exists THEN
            BEGIN
                INSERT INTO public.audit_logs (task_id, user_id, action_type, description)
                VALUES (OLD.task_id, v_user_id, v_action_type, v_description);
            EXCEPTION
                WHEN foreign_key_violation THEN
                    -- If task was deleted concurrently in same transaction, log without task_id
                    INSERT INTO public.audit_logs (user_id, action_type, description)
                    VALUES (v_user_id, v_action_type, v_description);
            END;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
