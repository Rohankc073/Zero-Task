-- Migration: 20260825000014_fix_send_overdue_reminder_audit_logs.sql
-- Description: Adds target_type and target_id to audit_logs and updates send_overdue_reminder to use valid audit_action_type.

BEGIN;

-- 1. Ensure columns exist on audit_logs table
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_id UUID;

-- 2. Update send_overdue_reminder function
CREATE OR REPLACE FUNCTION public.send_overdue_reminder(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller RECORD;
    v_task RECORD;
    v_dept_name TEXT := 'General';
    v_days_overdue INT := 1;
    v_assignee RECORD;
    v_superior RECORD;
    v_assignee_count INT := 0;
BEGIN
    -- Fetch caller info
    SELECT id, full_name, role INTO v_caller
    FROM public.users
    WHERE id = v_caller_id;

    IF v_caller.id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User profile not found.';
    END IF;

    -- Fetch task info
    SELECT t.id, t.title, t.due_date, t.created_by, t.department_id, t.status, d.name as dept_name
    INTO v_task
    FROM public.tasks t
    LEFT JOIN public.departments d ON d.id = t.department_id
    WHERE t.id = p_task_id;

    IF v_task.id IS NULL THEN
        RAISE EXCEPTION 'Task not found.';
    END IF;

    IF v_task.dept_name IS NOT NULL THEN
        v_dept_name := v_task.dept_name;
    END IF;

    IF v_task.due_date IS NOT NULL THEN
        v_days_overdue := GREATEST(1, EXTRACT(DAY FROM (NOW() - v_task.due_date))::INT);
    END IF;

    -- 1. Notify all current assignees
    FOR v_assignee IN (
        SELECT user_id FROM public.task_assignees
        WHERE task_id = p_task_id AND user_id != v_caller_id
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
    IF v_caller.role = 'Founder' AND v_task.department_id IS NOT NULL THEN
        FOR v_superior IN (
            SELECT id FROM public.users
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

    -- 3. Log Audit Trail using valid TASK_UPDATE action type
    INSERT INTO public.audit_logs (user_id, action_type, description, target_type, target_id)
    VALUES (
        v_caller_id,
        'TASK_UPDATE'::public.audit_action_type,
        COALESCE(v_caller.full_name, 'User') || ' (' || v_caller.role || ') sent overdue reminder for task: "' || v_task.title || '" (' || v_days_overdue || ' day(s) overdue).',
        'TASK',
        p_task_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Reminder sent successfully to ' || v_assignee_count || ' assignee(s) and department leadership.',
        'assignees_notified', v_assignee_count,
        'days_overdue', v_days_overdue
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_overdue_reminder(UUID) TO authenticated;

COMMIT;
