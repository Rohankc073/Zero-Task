-- Migration: 20260825000013_ensure_assignee_deadline_notifications.sql
-- Description: Ensures all task assignees, creators, and organizational hierarchy receive in-app notifications whenever a task deadline is modified.
BEGIN;
CREATE OR REPLACE FUNCTION public.notify_on_task_update() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_current_user_id UUID := auth.uid();
v_actor RECORD;
v_creator RECORD;
v_recipient RECORD;
v_dept_name TEXT := 'General';
v_old_date_str TEXT := 'None';
v_new_date_str TEXT := 'None';
BEGIN -- Fetch actor (the user performing the change)
IF v_current_user_id IS NOT NULL THEN
SELECT u.id,
    u.full_name,
    u.role,
    u.department_id,
    d.name as dept_name INTO v_actor
FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
WHERE u.id = v_current_user_id;
IF v_actor.dept_name IS NOT NULL THEN v_dept_name := v_actor.dept_name;
END IF;
END IF;
-- =========================================================================
-- EVENT 1: DEADLINE CHANGE
-- =========================================================================
IF TG_OP = 'UPDATE'
AND OLD.due_date IS DISTINCT
FROM NEW.due_date THEN -- Format date strings
    IF OLD.due_date IS NOT NULL THEN v_old_date_str := to_char(OLD.due_date, 'DD Mon YYYY');
END IF;
IF NEW.due_date IS NOT NULL THEN v_new_date_str := to_char(NEW.due_date, 'DD Mon YYYY');
END IF;
-- Fetch creator info
IF NEW.created_by IS NOT NULL THEN
SELECT u.id,
    u.full_name,
    u.role,
    u.department_id,
    d.name as dept_name INTO v_creator
FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
WHERE u.id = NEW.created_by;
IF v_creator.dept_name IS NOT NULL THEN v_dept_name := v_creator.dept_name;
END IF;
END IF;
-- 1. NOTIFY ALL TASK ASSIGNEES
FOR v_recipient IN (
    SELECT user_id AS id
    FROM public.task_assignees
    WHERE task_id = NEW.id
        AND user_id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Deadline Changed',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'Leadership') || ' changed the deadline of "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END LOOP;
-- 2. NOTIFY CREATOR (if updated by someone other than creator)
IF v_current_user_id IS NOT NULL
AND v_current_user_id != NEW.created_by
AND NEW.created_by IS NOT NULL THEN -- Check if not already notified as assignee
IF NOT EXISTS (
    SELECT 1
    FROM public.task_assignees
    WHERE task_id = NEW.id
        AND user_id = NEW.created_by
) THEN
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        NEW.created_by,
        'Task Deadline Changed',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'A superior') || ' changed the deadline of "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END IF;
END IF;
-- 3. NOTIFY HIERARCHY LEADERSHIP
IF v_creator.role = 'Employee' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE (
            (
                role = 'Manager'
                AND department_id = v_creator.department_id
            )
            OR (
                role = 'Department Head'
                AND department_id = v_creator.department_id
            )
            OR role = 'Founder'
        )
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id NOT IN (
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Deadline Updated',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'A user') || ' changed the deadline for "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END LOOP;
ELSIF v_creator.role = 'Manager' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE (
            (
                role = 'Department Head'
                AND department_id = v_creator.department_id
            )
            OR role = 'Founder'
        )
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id NOT IN (
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Deadline Updated',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'A user') || ' changed the deadline for "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END LOOP;
ELSIF v_creator.role = 'Department Head' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id NOT IN (
            SELECT user_id
            FROM public.task_assignees
            WHERE task_id = NEW.id
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Deadline Updated',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'A user') || ' changed the deadline for "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END LOOP;
END IF;
-- =========================================================================
-- EVENT 2: TASK COMPLETION
-- =========================================================================
ELSIF TG_OP = 'UPDATE'
AND (
    OLD.status IS DISTINCT
    FROM 'Done'
        AND NEW.status = 'Done'
) THEN IF NEW.created_by IS NOT NULL THEN
SELECT u.id,
    u.full_name,
    u.role,
    u.department_id,
    d.name as dept_name INTO v_creator
FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
WHERE u.id = NEW.created_by;
IF v_creator.dept_name IS NOT NULL THEN v_dept_name := v_creator.dept_name;
END IF;
END IF;
-- 1. Notify Creator
IF v_current_user_id IS NOT NULL
AND v_current_user_id != NEW.created_by
AND NEW.created_by IS NOT NULL THEN
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        NEW.created_by,
        'Task Completed',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'An assignee') || ' completed "' || NEW.title || '".',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END IF;
-- 2. Notify hierarchy
IF v_creator.role = 'Employee' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE (
            (
                role = 'Manager'
                AND department_id = v_creator.department_id
            )
            OR (
                role = 'Department Head'
                AND department_id = v_creator.department_id
            )
            OR role = 'Founder'
        )
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - "' || NEW.title || '" was completed by ' || COALESCE(v_actor.full_name, 'a team member') || '.',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END LOOP;
ELSIF v_creator.role = 'Manager' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE (
            (
                role = 'Department Head'
                AND department_id = v_creator.department_id
            )
            OR role = 'Founder'
        )
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - "' || NEW.title || '" was completed by ' || COALESCE(v_actor.full_name, 'a team member') || '.',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END LOOP;
ELSIF v_creator.role = 'Department Head' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND id != COALESCE(
            v_current_user_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND id != COALESCE(
            NEW.created_by,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - "' || NEW.title || '" was completed by ' || COALESCE(v_actor.full_name, 'a team member') || '.',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END LOOP;
END IF;
-- =========================================================================
-- EVENT 3: TASK DELETION (handled in BEFORE DELETE trigger)
-- =========================================================================
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_notify_on_task_update ON public.tasks;
CREATE TRIGGER trigger_notify_on_task_update
AFTER
UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_update();
COMMIT;