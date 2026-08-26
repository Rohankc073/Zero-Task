-- Migration: 20260826000023_allow_cross_dept_peer_segregation.sql
-- Description: Authorize cross-department peer delegation (Head -> Head, Manager -> Manager) and universal Founder oversight

CREATE OR REPLACE FUNCTION public.segregate_task(
    p_parent_task_id UUID,
    p_child_tasks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_actor RECORD;
    v_child RECORD;
    v_child_id UUID;
    v_child_item JSONB;
    v_assignee RECORD;
    v_founder_id UUID;
    v_created_count INT := 0;
    v_child_ids UUID[] := ARRAY[]::UUID[];
    v_child_names TEXT[] := ARRAY[]::TEXT[];
    v_child_summaries JSONB := '[]'::JSONB;
    v_child_names_summary TEXT := '';
    v_title TEXT;
    v_desc TEXT;
    v_priority TEXT;
    v_due_date TIMESTAMPTZ;
    v_assignee_id UUID;
    v_classification TEXT;
    v_dept_id UUID;
BEGIN
    -- 1. Verify caller profile
    SELECT id, full_name, email, role, department_id, company_id
    INTO v_actor
    FROM public.users
    WHERE id = auth.uid();

    IF v_actor.id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to segregate task.';
    END IF;

    -- 2. Fetch parent task
    SELECT t.*, d.name AS department_name
    INTO v_parent
    FROM public.tasks t
    LEFT JOIN public.departments d ON d.id = t.department_id
    WHERE t.id = p_parent_task_id;

    IF v_parent.id IS NULL THEN
        RAISE EXCEPTION 'Parent task not found.';
    END IF;

    -- 3. Check authorization:
    -- User can segregate if:
    -- a) Founder
    -- b) Department Head of the task's department
    -- c) Manager of the task's department
    -- d) Primary assignee (user_id = auth.uid()) or in task_assignees
    -- e) Execution Team member
    IF NOT (
        v_actor.role = 'Founder'
        OR (v_actor.role = 'Department Head' AND (v_actor.department_id IS NULL OR v_actor.department_id = v_parent.department_id))
        OR (v_actor.role = 'Manager' AND (v_actor.department_id IS NULL OR v_actor.department_id = v_parent.department_id))
        OR (v_parent.user_id = v_actor.id)
        OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = p_parent_task_id AND ta.user_id = v_actor.id)
        OR (v_actor.role = 'Execution Team')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have permission to segregate this task.';
    END IF;

    -- 4. Validate input array
    IF p_child_tasks IS NULL OR jsonb_array_length(p_child_tasks) = 0 THEN
        RAISE EXCEPTION 'At least one child task must be provided.';
    END IF;

    -- 5. Process and insert child tasks
    FOR v_child_item IN SELECT * FROM jsonb_array_elements(p_child_tasks)
    LOOP
        v_title := TRIM(v_child_item->>'title');
        v_desc := NULLIF(TRIM(v_child_item->>'description'), '');
        v_priority := COALESCE(NULLIF(TRIM(v_child_item->>'priority'), ''), 'Medium');
        v_due_date := (v_child_item->>'due_date')::TIMESTAMPTZ;
        v_assignee_id := (v_child_item->>'assignee_id')::UUID;
        v_classification := COALESCE(NULLIF(TRIM(v_child_item->>'execution_classification'), ''), v_parent.execution_classification, 'Operational');

        IF v_title IS NULL OR v_title = '' THEN
            RAISE EXCEPTION 'Each child task must have a non-empty title.';
        END IF;

        -- Validate assignee if provided
        v_dept_id := v_parent.department_id;
        IF v_assignee_id IS NOT NULL THEN
            SELECT id, full_name, email, role, department_id
            INTO v_assignee
            FROM public.users
            WHERE id = v_assignee_id;

            IF v_assignee.id IS NULL THEN
                RAISE EXCEPTION 'Assignee not found for child task: %', v_title;
            END IF;

            -- Department isolation validation with peer cross-department rules
            IF v_actor.role != 'Founder' AND v_actor.department_id IS NOT NULL AND v_assignee.department_id IS NOT NULL THEN
                IF v_assignee.department_id != v_actor.department_id AND v_assignee.department_id != v_parent.department_id THEN
                    -- Allow:
                    -- 1. Department Head -> Department Head
                    -- 2. Manager -> Manager
                    IF NOT (
                        (v_actor.role = 'Department Head' AND v_assignee.role = 'Department Head')
                        OR (v_actor.role = 'Manager' AND v_assignee.role = 'Manager')
                    ) THEN
                        RAISE EXCEPTION 'Cannot assign task to a member of a different department (% vs %)', v_assignee.full_name, v_actor.full_name;
                    END IF;
                END IF;
            END IF;

            IF v_assignee.department_id IS NOT NULL THEN
                v_dept_id := v_assignee.department_id;
            END IF;
        END IF;

        -- Insert child task with exact valid columns
        INSERT INTO public.tasks (
            title,
            description,
            priority,
            status,
            due_date,
            user_id,
            created_by,
            parent_task_id,
            department_id,
            company_id,
            milestone_id,
            execution_classification,
            progress
        ) VALUES (
            v_title,
            v_desc,
            v_priority,
            'To Do',
            v_due_date,
            v_assignee_id,
            v_actor.id,
            p_parent_task_id,
            v_dept_id,
            v_parent.company_id,
            v_parent.milestone_id,
            v_classification,
            0
        ) RETURNING id INTO v_child_id;

        -- Link in task_assignees
        IF v_assignee_id IS NOT NULL THEN
            INSERT INTO public.task_assignees (task_id, user_id)
            VALUES (v_child_id, v_assignee_id)
            ON CONFLICT DO NOTHING;

            -- Send task assignment notification to new assignee
            INSERT INTO public.in_app_notifications (
                user_id,
                title,
                message,
                type,
                action_url
            ) VALUES (
                v_assignee_id,
                'New Task Assigned',
                format('You have been assigned the execution task "%s" by %s (subtask of "%s").', v_title, COALESCE(v_actor.full_name, v_actor.email), v_parent.title),
                'TASK_ASSIGNED',
                format('/task/%s', v_child_id)
            );
        END IF;

        v_created_count := v_created_count + 1;
        v_child_ids := array_append(v_child_ids, v_child_id);
        v_child_names := array_append(v_child_names, v_title);
        v_child_summaries := v_child_summaries || jsonb_build_object(
            'id', v_child_id,
            'title', v_title,
            'assignee_id', v_assignee_id,
            'priority', v_priority
        );
    END LOOP;

    -- 6. Build summary for notifications
    v_child_names_summary := array_to_string(v_child_names, ', ');
    IF length(v_child_names_summary) > 120 THEN
        v_child_names_summary := substr(v_child_names_summary, 1, 117) || '...';
    END IF;

    -- 7. Insert activity timeline into execution_activity for parent task
    INSERT INTO public.execution_activity (
        task_id,
        user_id,
        event_type,
        metadata
    ) VALUES (
        p_parent_task_id,
        v_actor.id,
        'task_segregated',
        jsonb_build_object(
            'actor_name', COALESCE(v_actor.full_name, v_actor.email),
            'actor_role', v_actor.role,
            'child_count', v_created_count,
            'child_tasks', v_child_summaries
        )
    );

    -- 8. Insert corporate audit log
    INSERT INTO public.audit_logs (
        user_id,
        action_type,
        description
    ) VALUES (
        v_actor.id,
        'TASK_UPDATE',
        format('Task "%s" segregated into %s subtasks by %s (%s). Subtasks: %s', v_parent.title, v_created_count, COALESCE(v_actor.full_name, v_actor.email), v_actor.role, v_child_names_summary)
    );

    -- 9. Notify the original task assigner (created_by) if different from current actor
    IF v_parent.created_by IS NOT NULL AND v_parent.created_by != v_actor.id THEN
        INSERT INTO public.in_app_notifications (
            user_id,
            title,
            message,
            type,
            action_url
        ) VALUES (
            v_parent.created_by,
            'Task Segregated',
            format('%s segregated "%s" into %s execution tasks: %s', COALESCE(v_actor.full_name, v_actor.email), v_parent.title, v_created_count, v_child_names_summary),
            'TASK_SEGREGATED',
            format('/task/%s', p_parent_task_id)
        );
    END IF;

    -- 10. Founder Oversight: Notify all Founders whenever ANY segregation happens
    FOR v_founder_id IN
        SELECT id FROM public.users
        WHERE role = 'Founder'
          AND id != v_actor.id
          AND (v_parent.created_by IS NULL OR id != v_parent.created_by)
    LOOP
        INSERT INTO public.in_app_notifications (
            user_id,
            title,
            message,
            type,
            action_url
        ) VALUES (
            v_founder_id,
            'Founder Alert: Task Segregated',
            format('[%s] %s segregated "%s" into %s execution tasks: %s', COALESCE(v_parent.department_name, 'General'), COALESCE(v_actor.full_name, v_actor.email), v_parent.title, v_created_count, v_child_names_summary),
            'TASK_SEGREGATED',
            format('/task/%s', p_parent_task_id)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'parent_task_id', p_parent_task_id,
        'created_count', v_created_count,
        'child_ids', v_child_ids
    );
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.segregate_task(UUID, JSONB) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
