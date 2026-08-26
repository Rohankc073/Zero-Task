-- Migration: 20260819000006_execution_activity_trigger.sql
-- Description: Adds triggers for automating execution_activity generation from tasks

CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        IF v_user_id IS NULL THEN
            v_user_id := NEW.created_by;
        END IF;

        INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
        VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'task_created', jsonb_build_object(
            'title', NEW.title,
            'status', NEW.status,
            'priority', NEW.priority
        ));
        
        IF NEW.parent_task_id IS NOT NULL THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.parent_task_id, NEW.project_id, NEW.milestone_id, v_user_id, 'subtask_created', jsonb_build_object(
                'subtask_id', NEW.id,
                'title', NEW.title
            ));
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'status_changed', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
            
            IF NEW.status = 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'task_completed', jsonb_build_object());
                
                IF NEW.parent_task_id IS NOT NULL THEN
                    INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                    VALUES (NEW.parent_task_id, NEW.project_id, NEW.milestone_id, v_user_id, 'subtask_completed', jsonb_build_object(
                        'subtask_id', NEW.id,
                        'title', NEW.title
                    ));
                END IF;
            END IF;
            
            IF OLD.status = 'Done' AND NEW.status != 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'task_reopened', jsonb_build_object());
            END IF;
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'priority_changed', jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority));
        END IF;

        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            IF OLD.user_id IS NULL THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'task_assigned', jsonb_build_object('assignee_id', NEW.user_id));
            ELSE
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'task_reassigned', jsonb_build_object('old_assignee_id', OLD.user_id, 'new_assignee_id', NEW.user_id));
            END IF;
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'due_date_changed', jsonb_build_object('old_date', OLD.due_date, 'new_date', NEW.due_date));
        END IF;
        
        IF OLD.description IS DISTINCT FROM NEW.description THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, NEW.project_id, NEW.milestone_id, v_user_id, 'description_changed', '{}'::jsonb);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.execution_activity (project_id, milestone_id, user_id, event_type, metadata)
        VALUES (OLD.project_id, OLD.milestone_id, v_user_id, 'task_deleted', jsonb_build_object('task_title', OLD.title));
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_task_activity ON public.tasks;
CREATE TRIGGER tr_task_activity
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_activity();

