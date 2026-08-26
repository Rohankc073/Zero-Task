-- Migration: 20260825000009_hierarchy_notifications.sql
-- Description: Centralized automated notification triggers for Self-Assignment, Deadline Changes, Completions, and Deletions.
BEGIN;
-- 1. Ensure in_app_notifications RLS allows system and authenticated inserts
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.in_app_notifications;
CREATE POLICY "Authenticated users can insert notifications" ON public.in_app_notifications FOR
INSERT TO authenticated WITH CHECK (true);
-- 2. Trigger on task_assignees: Handles Self-Assignment vs Delegated Assignment
CREATE OR REPLACE FUNCTION public.notify_on_task_assignee() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_task RECORD;
v_creator RECORD;
v_dept_name TEXT := 'General';
v_due_str TEXT := 'No deadline';
v_recipient RECORD;
BEGIN -- Fetch task info
SELECT id,
    title,
    priority,
    due_date,
    created_by,
    department_id INTO v_task
FROM public.tasks
WHERE id = NEW.task_id;
IF v_task.due_date IS NOT NULL THEN v_due_str := to_char(v_task.due_date, 'DD Mon YYYY');
END IF;
-- Fetch creator info
IF v_task.created_by IS NOT NULL THEN
SELECT u.id,
    u.full_name,
    u.role,
    u.department_id,
    d.name as dept_name INTO v_creator
FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
WHERE u.id = v_task.created_by;
IF v_creator.dept_name IS NOT NULL THEN v_dept_name := v_creator.dept_name;
END IF;
END IF;
-- CASE A: SELF-ASSIGNED TASK (creator assigns to themself)
IF NEW.user_id = v_task.created_by THEN -- Do not send "task assigned to you" to self.
-- Instead, notify superiors up the hierarchy:
-- 1. If Employee created: Notify Managers, Department Head, and Founders
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
        AND id != v_creator.id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Self-Assigned Task Created',
        v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Employee') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
        'SELF_ASSIGNED_TASK',
        '/task/' || v_task.id
    );
END LOOP;
-- 2. If Manager created: Notify Department Head and Founders
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
        AND id != v_creator.id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Self-Assigned Task Created',
        v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Manager') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
        'SELF_ASSIGNED_TASK',
        '/task/' || v_task.id
    );
END LOOP;
-- 3. If Department Head created: Notify Founders
ELSIF v_creator.role = 'Department Head' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND id != v_creator.id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Self-Assigned Task Created',
        v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Department Head') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
        'SELF_ASSIGNED_TASK',
        '/task/' || v_task.id
    );
END LOOP;
END IF;
-- CASE B: DELEGATED TASK (assigned to another user)
ELSE
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        NEW.user_id,
        'New Task Assigned',
        v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'A user') || ' assigned task: "' || v_task.title || '". Priority: ' || COALESCE(v_task.priority, 'Medium') || '. Due: ' || v_due_str,
        'TASK_ASSIGNED',
        '/task/' || v_task.id
    );
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_notify_task_assignee
AFTER
INSERT ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_assignee();
-- 3. Trigger on tasks for Deadline Changes, Completions, and Deletions
CREATE OR REPLACE FUNCTION public.notify_on_task_events() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_actor RECORD;
v_creator RECORD;
v_dept_name TEXT := 'General';
v_old_date_str TEXT := 'None';
v_new_date_str TEXT := 'None';
v_recipient RECORD;
v_current_user_id UUID;
BEGIN v_current_user_id := auth.uid();
-- Fetch actor information
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
-- 1. Notify creator (if updated by someone else)
IF v_current_user_id IS NOT NULL
AND v_current_user_id != NEW.created_by THEN
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        NEW.created_by,
        'Task Deadline Changed',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, 'A superior') || ' changed the deadline of "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id
    );
END IF;
-- 2. Notify hierarchy above creator
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
        AND id != v_current_user_id
        AND id != NEW.created_by
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
        AND id != v_current_user_id
        AND id != NEW.created_by
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
        AND id != v_current_user_id
        AND id != NEW.created_by
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
        AND id != v_current_user_id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - ' || COALESCE(v_actor.full_name, v_creator.full_name, 'User') || ' completed task: "' || NEW.title || '".',
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
        AND id != v_current_user_id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - ' || COALESCE(
            v_actor.full_name,
            v_creator.full_name,
            'Manager'
        ) || ' completed task: "' || NEW.title || '".',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END LOOP;
ELSIF v_creator.role = 'Department Head' THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND id != v_current_user_id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Completed',
        v_dept_name || ' - ' || COALESCE(
            v_actor.full_name,
            v_creator.full_name,
            'Department Head'
        ) || ' completed task: "' || NEW.title || '".',
        'TASK_COMPLETED',
        '/task/' || NEW.id
    );
END LOOP;
END IF;
-- =========================================================================
-- EVENT 3: TASK DELETION
-- =========================================================================
ELSIF TG_OP = 'DELETE' THEN -- Get department name for old task
IF OLD.department_id IS NOT NULL THEN
SELECT name INTO v_dept_name
FROM public.departments
WHERE id = OLD.department_id;
END IF;
-- 1. Notify Founders (all Founders get organizational deletion alerts)
FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND id != v_current_user_id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type)
VALUES (
        v_recipient.id,
        'Task Deleted',
        COALESCE(v_dept_name, 'General') || ' - ' || COALESCE(v_actor.full_name, 'A user') || ' deleted task: "' || OLD.title || '".',
        'TASK_DELETED'
    );
END LOOP;
-- 2. If deleted by a superior, notify the creator
IF OLD.created_by IS NOT NULL
AND v_current_user_id IS NOT NULL
AND v_current_user_id != OLD.created_by THEN
INSERT INTO public.in_app_notifications (user_id, title, message, type)
VALUES (
        OLD.created_by,
        'Your Task Was Deleted',
        COALESCE(v_dept_name, 'General') || ' - ' || COALESCE(v_actor.full_name, 'A superior') || ' deleted your task: "' || OLD.title || '".',
        'TASK_DELETED'
    );
END IF;
RETURN OLD;
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_task_events ON public.tasks;
CREATE TRIGGER trg_notify_task_events
AFTER
UPDATE
    OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_events();
COMMIT;