-- Migration: 20260820000003_task_assignment_notifications.sql

-- 1. Update assignment rules
CREATE OR REPLACE FUNCTION public.can_assign_task(assignee_id UUID, assigner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    assigner_role text;
    assigner_dept UUID;
    assignee_role text;
    assignee_dept UUID;
BEGIN
    SELECT role::text, department_id INTO assigner_role, assigner_dept 
    FROM public.users WHERE id = assigner_id;
    
    SELECT role::text, department_id INTO assignee_role, assignee_dept 
    FROM public.users WHERE id = assignee_id;

    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    IF assigner_role = 'Manager' THEN
        RETURN assignee_role NOT IN ('Founder', 'Department Head');
    END IF;

    RETURN FALSE;
END;
$$;

-- 2. Create trigger to insert notifications on new assignments
CREATE OR REPLACE FUNCTION public.notify_on_task_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    task_title TEXT;
    assigner_name TEXT;
    task_priority TEXT;
    task_due_date TIMESTAMPTZ;
    due_date_str TEXT;
BEGIN
    SELECT title, priority, due_date INTO task_title, task_priority, task_due_date 
    FROM public.tasks WHERE id = NEW.task_id;

    IF auth.uid() IS NOT NULL THEN
        SELECT full_name INTO assigner_name FROM public.users WHERE id = auth.uid();
    ELSE
        assigner_name := 'System';
    END IF;

    IF task_due_date IS NOT NULL THEN
        due_date_str := chr(10) || chr(10) || 'Due:' || chr(10) || to_char(task_due_date, 'DD Mon YYYY');
    ELSE
        due_date_str := '';
    END IF;

    INSERT INTO public.in_app_notifications (user_id, title, message)
    VALUES (
        NEW.user_id,
        'New Task Assigned',
        '"' || COALESCE(task_title, 'Untitled Task') || '"' || chr(10) || chr(10) || 'Assigned by:' || chr(10) || COALESCE(assigner_name, 'Unknown') || chr(10) || chr(10) || 'Priority:' || chr(10) || COALESCE(task_priority, 'None') || due_date_str
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_notify_task_assignee
    AFTER INSERT ON public.task_assignees
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_task_assignee();


-- 3. Fix Storage Deletion Policy to allow Founder overrides
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own uploads or Founders can delete any" ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can delete own uploads or Founders can delete any"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'task_attachments' AND (
        auth.uid() = owner
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'Founder'
        )
    )
);
