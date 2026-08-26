-- Migration: 20260821134500_fix_task_project_id_triggers.sql
-- Description: Fixes check_employee_task_update and log_task_activity triggers to retrieve project_id dynamically from milestones since tasks table doesn't have project_id.

-- 1. Update check_employee_task_update
CREATE OR REPLACE FUNCTION public.check_employee_task_update()
RETURNS trigger AS $$
DECLARE
    user_role text;
    old_project uuid;
    new_project uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    user_role := public.get_auth_user_role();

    IF user_role = 'Employee' THEN
        IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
            RAISE EXCEPTION 'Employees are not permitted to change the department of a task.';
        END IF;

        -- Check if they changed milestone to one belonging to a different project
        IF OLD.milestone_id IS DISTINCT FROM NEW.milestone_id THEN
            SELECT project_id INTO old_project FROM public.project_milestones WHERE id = OLD.milestone_id;
            SELECT project_id INTO new_project FROM public.project_milestones WHERE id = NEW.milestone_id;
            IF old_project IS DISTINCT FROM new_project THEN
                RAISE EXCEPTION 'Employees are not permitted to move a task to a different project.';
            END IF;
        END IF;

        IF OLD.title IS DISTINCT FROM NEW.title THEN
            RAISE EXCEPTION 'Employees are not permitted to change task title.';
        END IF;

        IF OLD.description IS DISTINCT FROM NEW.description THEN
            RAISE EXCEPTION 'Employees are not permitted to change task description.';
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            RAISE EXCEPTION 'Employees are not permitted to change task priority.';
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            RAISE EXCEPTION 'Employees are not permitted to change task due date.';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
            RAISE EXCEPTION 'Employees are not permitted to change task creator.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update log_task_activity
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_project_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Retrieve project_id from milestone_id dynamically
    IF TG_OP = 'DELETE' THEN
        IF OLD.milestone_id IS NOT NULL THEN
            SELECT project_id INTO v_project_id FROM public.project_milestones WHERE id = OLD.milestone_id;
        END IF;
    ELSE
        IF NEW.milestone_id IS NOT NULL THEN
            SELECT project_id INTO v_project_id FROM public.project_milestones WHERE id = NEW.milestone_id;
        END IF;
    END IF;
    
    IF TG_OP = 'INSERT' THEN
        IF v_user_id IS NULL THEN
            v_user_id := NEW.created_by;
        END IF;

        INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
        VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_created', jsonb_build_object(
            'title', NEW.title,
            'status', NEW.status,
            'priority', NEW.priority
        ));
        
        IF NEW.parent_task_id IS NOT NULL THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.parent_task_id, v_project_id, NEW.milestone_id, v_user_id, 'subtask_created', jsonb_build_object(
                'subtask_id', NEW.id,
                'title', NEW.title
            ));
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'status_changed', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
            
            IF NEW.status = 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_completed', jsonb_build_object());
                
                IF NEW.parent_task_id IS NOT NULL THEN
                    INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                    VALUES (NEW.parent_task_id, v_project_id, NEW.milestone_id, v_user_id, 'subtask_completed', jsonb_build_object(
                        'subtask_id', NEW.id,
                        'title', NEW.title
                    ));
                END IF;
            END IF;
            
            IF OLD.status = 'Done' AND NEW.status != 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_reopened', jsonb_build_object());
            END IF;
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'priority_changed', jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority));
        END IF;

        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            IF OLD.user_id IS NULL THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_assigned', jsonb_build_object('assignee_id', NEW.user_id));
            ELSE
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_reassigned', jsonb_build_object('old_assignee_id', OLD.user_id, 'new_assignee_id', NEW.user_id));
            END IF;
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'due_date_changed', jsonb_build_object('old_date', OLD.due_date, 'new_date', NEW.due_date));
        END IF;
        
        IF OLD.description IS DISTINCT FROM NEW.description THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'description_changed', '{}'::jsonb);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.execution_activity (project_id, milestone_id, user_id, event_type, metadata)
        VALUES (v_project_id, OLD.milestone_id, v_user_id, 'task_deleted', jsonb_build_object('task_title', OLD.title));
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;
