-- Migration: 20260825000012_overdue_task_system.sql
-- Description: Adds overdue tracking, automatic overdue hierarchy notifications, and manual overdue reminder RPC with audit logging.
BEGIN;
-- 1. Add tracking column to prevent duplicate automatic alerts
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS overdue_alert_sent_at TIMESTAMPTZ;
-- 2. Function to send automatic overdue alert for a specific task
CREATE OR REPLACE FUNCTION public.notify_overdue_task(p_task_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_task RECORD;
v_creator RECORD;
v_dept_name TEXT := 'General';
v_due_str TEXT := 'No deadline';
v_days_overdue INT := 1;
v_recipient RECORD;
BEGIN
SELECT id,
    title,
    due_date,
    created_by,
    department_id,
    status INTO v_task
FROM public.tasks
WHERE id = p_task_id;
IF v_task.id IS NULL
OR v_task.status IN ('Done', 'Completed')
OR v_task.due_date IS NULL
OR v_task.due_date >= NOW() THEN RETURN;
END IF;
v_days_overdue := GREATEST(
    1,
    EXTRACT(
        DAY
        FROM (NOW() - v_task.due_date)
    )::INT
);
v_due_str := to_char(v_task.due_date, 'DD Mon YYYY');
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
-- Notify Founder (Organization-wide overdue visibility)
FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE role = 'Founder'
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Overdue Alert',
        v_dept_name || ' - "' || v_task.title || '" is overdue. Deadline was ' || v_due_str || ' (' || v_days_overdue || ' day(s) overdue).',
        'TASK_OVERDUE',
        '/task/' || v_task.id
    );
END LOOP;
-- Notify Department Head & Managers if subordinate task
IF v_creator.role IN ('Employee', 'Manager')
AND v_creator.department_id IS NOT NULL THEN FOR v_recipient IN (
    SELECT id
    FROM public.users
    WHERE (
            (
                role = 'Department Head'
                AND department_id = v_creator.department_id
            )
            OR (
                role = 'Manager'
                AND department_id = v_creator.department_id
                AND v_creator.role = 'Employee'
            )
        )
        AND id != COALESCE(
            v_creator.id,
            '00000000-0000-0000-0000-000000000000'::UUID
        )
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_recipient.id,
        'Task Overdue Alert',
        v_dept_name || ' - "' || v_task.title || '" is overdue. Deadline was ' || v_due_str || ' (' || v_days_overdue || ' day(s) overdue).',
        'TASK_OVERDUE',
        '/task/' || v_task.id
    );
END LOOP;
END IF;
-- Update tracking column to prevent duplicate automatic notifications
UPDATE public.tasks
SET overdue_alert_sent_at = NOW()
WHERE id = p_task_id;
END;
$$;
-- 3. Batch check function
CREATE OR REPLACE FUNCTION public.check_and_notify_overdue_tasks() RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_task_id UUID;
v_count INT := 0;
BEGIN FOR v_task_id IN (
    SELECT id
    FROM public.tasks
    WHERE due_date < NOW()
        AND status NOT IN ('Done', 'Completed')
        AND overdue_alert_sent_at IS NULL
) LOOP PERFORM public.notify_overdue_task(v_task_id);
v_count := v_count + 1;
END LOOP;
RETURN v_count;
END;
$$;
-- 4. Trigger to reset/trigger overdue alert on task updates
CREATE OR REPLACE FUNCTION public.handle_task_overdue_state_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ BEGIN -- If task is completed or deadline pushed to future, reset alert tracking
    IF NEW.status IN ('Done', 'Completed')
    OR NEW.due_date IS NULL
    OR NEW.due_date >= NOW() THEN NEW.overdue_alert_sent_at := NULL;
ELSIF NEW.due_date < NOW()
AND NEW.status NOT IN ('Done', 'Completed') THEN -- If deadline was shifted to past or changed, reset to allow new notification
IF OLD.due_date IS DISTINCT
FROM NEW.due_date THEN NEW.overdue_alert_sent_at := NULL;
END IF;
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_task_overdue_state ON public.tasks;
CREATE TRIGGER trigger_task_overdue_state BEFORE
UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_task_overdue_state_change();
-- 5. RPC for Manual "Send Reminder" by Founder / Superiors
CREATE OR REPLACE FUNCTION public.send_overdue_reminder(p_task_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_caller_id UUID := auth.uid();
v_caller RECORD;
v_task RECORD;
v_dept_name TEXT := 'General';
v_days_overdue INT := 1;
v_assignee RECORD;
v_superior RECORD;
v_assignee_count INT := 0;
BEGIN -- Fetch caller info
SELECT id,
    full_name,
    role INTO v_caller
FROM public.users
WHERE id = v_caller_id;
IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Unauthorized: User profile not found.';
END IF;
-- Fetch task info
SELECT t.id,
    t.title,
    t.due_date,
    t.created_by,
    t.department_id,
    t.status,
    d.name as dept_name INTO v_task
FROM public.tasks t
    LEFT JOIN public.departments d ON d.id = t.department_id
WHERE t.id = p_task_id;
IF v_task.id IS NULL THEN RAISE EXCEPTION 'Task not found.';
END IF;
IF v_task.dept_name IS NOT NULL THEN v_dept_name := v_task.dept_name;
END IF;
IF v_task.due_date IS NOT NULL THEN v_days_overdue := GREATEST(
    1,
    EXTRACT(
        DAY
        FROM (NOW() - v_task.due_date)
    )::INT
);
END IF;
-- 1. Notify all current assignees
FOR v_assignee IN (
    SELECT user_id
    FROM public.task_assignees
    WHERE task_id = p_task_id
        AND user_id != v_caller_id
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_assignee.user_id,
        'Overdue Task Reminder',
        'Reminder from ' || v_caller.role || ' (' || COALESCE(v_caller.full_name, 'Leadership') || '): "' || v_task.title || '" is overdue by ' || v_days_overdue || ' day(s). Please complete it as soon as possible.',
        'OVERDUE_REMINDER',
        '/task/' || v_task.id
    );
v_assignee_count := v_assignee_count + 1;
END LOOP;
-- 2. If Founder sent reminder, also send oversight notice to Dept Manager and Dept Head
IF v_caller.role = 'Founder'
AND v_task.department_id IS NOT NULL THEN FOR v_superior IN (
    SELECT id
    FROM public.users
    WHERE (role IN ('Manager', 'Department Head'))
        AND department_id = v_task.department_id
        AND id != v_caller_id
        AND is_approved = true
) LOOP
INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
VALUES (
        v_superior.id,
        'Overdue Task Reminder Escalation',
        'Founder sent an overdue reminder to assignees for "' || v_task.title || '" in ' || v_dept_name || ' (' || v_days_overdue || ' day(s) overdue).',
        'OVERDUE_REMINDER',
        '/task/' || v_task.id
    );
END LOOP;
END IF;
-- 3. Log Audit Trail
INSERT INTO public.audit_logs (
        user_id,
        action_type,
        description,
        target_type,
        target_id
    )
VALUES (
        v_caller_id,
        'OVERDUE_REMINDER_SENT',
        COALESCE(v_caller.full_name, 'User') || ' (' || v_caller.role || ') sent overdue reminder for task: "' || v_task.title || '" (' || v_days_overdue || ' day(s) overdue).',
        'TASK',
        p_task_id
    );
RETURN jsonb_build_object(
    'success',
    true,
    'message',
    'Reminder sent successfully to ' || v_assignee_count || ' assignee(s) and department leadership.',
    'assignees_notified',
    v_assignee_count,
    'days_overdue',
    v_days_overdue
);
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_overdue_reminder(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_notify_overdue_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_overdue_task(UUID) TO authenticated;
COMMIT;