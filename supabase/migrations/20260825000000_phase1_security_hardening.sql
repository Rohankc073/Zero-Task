-- Phase 1: Security Hardening & Meeting Participant Visibility

-- 1. Fix the meetings SELECT policy so participants can view the meeting
-- The current policy is likely: CREATE POLICY "Users can view meetings they organized" ON public.meetings FOR SELECT USING (auth.uid() = organizer_id);
-- We will replace it with a broader policy allowing both organizers and participants.

DROP POLICY IF EXISTS "Users can view meetings they organized" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings they are part of" ON public.meetings;

CREATE POLICY "Users can view meetings they are part of"
ON public.meetings
FOR SELECT
USING (
    organizer_id = auth.uid() 
    OR auth.uid() IN (SELECT user_id FROM public.meeting_participants WHERE meeting_id = id)
);

-- 2. Audit logging for task_assignees
-- We need to ensure that when a task assignee is inserted, deleted, or updated, an audit log is generated.

-- Function to handle task assignee audit
CREATE OR REPLACE FUNCTION public.log_task_assignee_audit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_action_type audit_action_type;
    v_description TEXT;
    v_assignee_name TEXT;
BEGIN
    v_user_id := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'TASK_UPDATE';
        SELECT full_name INTO v_assignee_name FROM public.users WHERE id = NEW.user_id;
        v_description := 'User assigned to task: ' || COALESCE(v_assignee_name, 'Unknown') || ' (User ID: ' || NEW.user_id || ')';
        
        INSERT INTO public.audit_logs (task_id, user_id, action_type, description)
        VALUES (NEW.task_id, v_user_id, v_action_type, v_description);
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'TASK_UPDATE';
        SELECT full_name INTO v_assignee_name FROM public.users WHERE id = OLD.user_id;
        v_description := 'User removed from task: ' || COALESCE(v_assignee_name, 'Unknown') || ' (User ID: ' || OLD.user_id || ')';
        
        INSERT INTO public.audit_logs (task_id, user_id, action_type, description)
        VALUES (OLD.task_id, v_user_id, v_action_type, v_description);
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$;

-- Create triggers on task_assignees
DROP TRIGGER IF EXISTS trg_audit_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_audit_task_assignee
AFTER INSERT OR DELETE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.log_task_assignee_audit_events();
