-- Migration: 20260829000001_fix_unassigned_record.sql
-- Description: Fix unassigned v_creator RECORD in notification triggers

CREATE OR REPLACE FUNCTION public.notify_on_task_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_creator RECORD;
  v_dept_name TEXT := 'General';
  v_due_str TEXT := 'No deadline';
  v_recipient RECORD;
BEGIN
  -- Initialize v_creator to avoid "tuple structure indeterminate" errors if created_by is null
  SELECT NULL::uuid as id, NULL::text as full_name, NULL::public.user_role_enum as role, NULL::uuid as department_id, NULL::text as dept_name INTO v_creator;

  -- Fetch task info
  SELECT id, title, priority, due_date, created_by, department_id
  INTO v_task
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF v_task.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_task.due_date IS NOT NULL THEN
    v_due_str := to_char(v_task.due_date, 'DD Mon YYYY');
  END IF;

  -- Fetch creator info
  IF v_task.created_by IS NOT NULL THEN
    SELECT u.id, u.full_name, u.role, u.department_id, d.name as dept_name
    INTO v_creator
    FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
    WHERE u.id = v_task.created_by;

    IF v_creator.dept_name IS NOT NULL THEN
      v_dept_name := v_creator.dept_name;
    END IF;
  END IF;

  -- CASE A: SELF-ASSIGNED TASK
  IF NEW.user_id = v_task.created_by THEN
    IF v_creator.role = 'Employee' THEN
      FOR v_recipient IN (
        SELECT id FROM public.users
        WHERE (
          (role = 'Manager' AND department_id = v_creator.department_id)
          OR (role = 'Department Head' AND department_id = v_creator.department_id)
          OR role = 'Founder'
        )
        AND id != v_creator.id
        AND is_approved = true
      ) LOOP
        PERFORM public.sync_task_notification(
          v_recipient.id,
          v_task.id,
          'TASK_SELF_ASSIGNED',
          'Self-Assigned Task Created',
          v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Employee') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
          'SELF_ASSIGNED_TASK',
          '/task/' || v_task.id,
          v_creator.id,
          v_creator.full_name,
          v_creator.role::text,
          v_task.title,
          v_dept_name,
          jsonb_build_object('priority', v_task.priority, 'due_date', v_due_str)
        );
      END LOOP;
    ELSIF v_creator.role = 'Manager' THEN
      FOR v_recipient IN (
        SELECT id FROM public.users
        WHERE (
          (role = 'Department Head' AND department_id = v_creator.department_id)
          OR role = 'Founder'
        )
        AND id != v_creator.id
        AND is_approved = true
      ) LOOP
        PERFORM public.sync_task_notification(
          v_recipient.id,
          v_task.id,
          'TASK_SELF_ASSIGNED',
          'Self-Assigned Task Created',
          v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Manager') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
          'SELF_ASSIGNED_TASK',
          '/task/' || v_task.id,
          v_creator.id,
          v_creator.full_name,
          v_creator.role::text,
          v_task.title,
          v_dept_name,
          jsonb_build_object('priority', v_task.priority, 'due_date', v_due_str)
        );
      END LOOP;
    ELSIF v_creator.role = 'Department Head' THEN
      FOR v_recipient IN (
        SELECT id FROM public.users
        WHERE role = 'Founder'
        AND id != v_creator.id
        AND is_approved = true
      ) LOOP
        PERFORM public.sync_task_notification(
          v_recipient.id,
          v_task.id,
          'TASK_SELF_ASSIGNED',
          'Self-Assigned Task Created',
          v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'Department Head') || ' created a self-assigned task: "' || v_task.title || '". Due: ' || v_due_str,
          'SELF_ASSIGNED_TASK',
          '/task/' || v_task.id,
          v_creator.id,
          v_creator.full_name,
          v_creator.role::text,
          v_task.title,
          v_dept_name,
          jsonb_build_object('priority', v_task.priority, 'due_date', v_due_str)
        );
      END LOOP;
    END IF;

  -- CASE B: DELEGATED TASK (assigned to another user)
  ELSE
    PERFORM public.sync_task_notification(
      NEW.user_id,
      v_task.id,
      'TASK_ASSIGNED',
      'New Task Assigned',
      v_dept_name || ' - ' || COALESCE(v_creator.full_name, 'A user') || ' assigned task: "' || v_task.title || '". Priority: ' || COALESCE(v_task.priority::text, 'Medium') || '. Due: ' || v_due_str,
      'TASK_ASSIGNED',
      '/task/' || v_task.id,
      v_creator.id,
      v_creator.full_name,
      v_creator.role::text,
      v_task.title,
      v_dept_name,
      jsonb_build_object('priority', v_task.priority, 'due_date', v_due_str)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_task_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_creator RECORD;
  v_actor RECORD;
  v_recipient RECORD;
  v_dept_name TEXT := 'General';
  v_old_date_str TEXT := 'No deadline';
  v_new_date_str TEXT := 'No deadline';
  v_actor_name TEXT := 'A user';
  v_actor_role TEXT := 'Unknown';
BEGIN
  -- Initialize v_creator
  SELECT NULL::uuid as id, NULL::text as full_name, NULL::public.user_role_enum as role, NULL::uuid as department_id, NULL::text as dept_name INTO v_creator;

  IF v_current_user_id IS NOT NULL THEN
    SELECT u.id, u.full_name, u.role, u.department_id, d.name as dept_name
    INTO v_actor
    FROM public.users u
    LEFT JOIN public.departments d ON d.id = u.department_id
    WHERE u.id = v_current_user_id;

    IF v_actor.full_name IS NOT NULL THEN
      v_actor_name := v_actor.full_name;
    END IF;
    IF v_actor.role IS NOT NULL THEN
      v_actor_role := v_actor.role::text;
    END IF;
    IF v_actor.dept_name IS NOT NULL THEN
      v_dept_name := v_actor.dept_name;
    END IF;
  END IF;

  -- =========================================================================
  -- EVENT 1: DEADLINE CHANGE
  -- =========================================================================
  IF TG_OP = 'UPDATE' AND OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    IF OLD.due_date IS NOT NULL THEN
      v_old_date_str := to_char(OLD.due_date, 'DD Mon YYYY');
    END IF;
    IF NEW.due_date IS NOT NULL THEN
      v_new_date_str := to_char(NEW.due_date, 'DD Mon YYYY');
    END IF;

    IF NEW.created_by IS NOT NULL THEN
      SELECT u.id, u.full_name, u.role, u.department_id, d.name as dept_name
      INTO v_creator
      FROM public.users u
      LEFT JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = NEW.created_by;

      IF v_creator.dept_name IS NOT NULL THEN
        v_dept_name := v_creator.dept_name;
      END IF;
    END IF;

    -- 1. Notify creator if updated by someone else
    IF v_current_user_id IS NOT NULL AND v_current_user_id != NEW.created_by THEN
      PERFORM public.sync_task_notification(
        NEW.created_by,
        NEW.id,
        'TASK_DEADLINE_CHANGED',
        'Task Deadline Changed',
        v_dept_name || ' - ' || v_actor_name || ' changed deadline for "' || NEW.title || '" from ' || v_old_date_str || ' to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id,
        v_current_user_id,
        v_actor_name,
        v_actor_role,
        NEW.title,
        v_dept_name,
        jsonb_build_object('old_deadline', v_old_date_str, 'new_deadline', v_new_date_str)
      );
    END IF;

    -- 2. Notify assignees
    FOR v_recipient IN (
      SELECT user_id FROM public.task_assignees
      WHERE task_id = NEW.id AND user_id != COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) LOOP
      PERFORM public.sync_task_notification(
        v_recipient.user_id,
        NEW.id,
        'TASK_DEADLINE_CHANGED',
        'Task Deadline Changed',
        v_dept_name || ' - ' || v_actor_name || ' changed deadline for "' || NEW.title || '" to ' || v_new_date_str || '.',
        'DEADLINE_CHANGED',
        '/task/' || NEW.id,
        v_current_user_id,
        v_actor_name,
        v_actor_role,
        NEW.title,
        v_dept_name,
        jsonb_build_object('old_deadline', v_old_date_str, 'new_deadline', v_new_date_str)
      );
    END LOOP;

    -- 3. Notify superiors in hierarchy
    IF v_creator.role = 'Employee' THEN
      FOR v_recipient IN (
        SELECT id FROM public.users
        WHERE ((role = 'Manager' AND department_id = v_creator.department_id)
               OR (role = 'Department Head' AND department_id = v_creator.department_id)
               OR role = 'Founder')
        AND id != COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND id != NEW.created_by
        AND is_approved = true
      ) LOOP
        PERFORM public.sync_task_notification(
          v_recipient.id,
          NEW.id,
          'TASK_DEADLINE_CHANGED',
          'Deadline Updated',
          v_dept_name || ' - ' || v_actor_name || ' changed deadline for "' || NEW.title || '" to ' || v_new_date_str || '.',
          'DEADLINE_CHANGED',
          '/task/' || NEW.id,
          v_current_user_id,
          v_actor_name,
          v_actor_role,
          NEW.title,
          v_dept_name,
          jsonb_build_object('old_deadline', v_old_date_str, 'new_deadline', v_new_date_str)
        );
      END LOOP;
    END IF;

  -- =========================================================================
  -- EVENT 2: STATUS CHANGE TO IN PROGRESS
  -- =========================================================================
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'In Progress' AND NEW.status = 'In Progress' THEN
    IF NEW.created_by IS NOT NULL THEN
      SELECT u.id, u.full_name, u.role, u.department_id, d.name as dept_name
      INTO v_creator
      FROM public.users u
      LEFT JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = NEW.created_by;

      IF v_creator.dept_name IS NOT NULL THEN
        v_dept_name := v_creator.dept_name;
      END IF;
    END IF;

    -- Notify superiors / creator
    FOR v_recipient IN (
      SELECT id FROM public.users
      WHERE (
        role = 'Founder'
        OR (role IN ('Manager', 'Department Head') AND department_id = NEW.department_id)
        OR id = NEW.created_by
      )
      AND id != COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_approved = true
    ) LOOP
      PERFORM public.sync_task_notification(
        v_recipient.id,
        NEW.id,
        'TASK_IN_PROGRESS',
        'Task In Progress',
        v_dept_name || ' - ' || v_actor_name || ' started working on: "' || NEW.title || '".',
        'TASK_STARTED',
        '/task/' || NEW.id,
        v_current_user_id,
        v_actor_name,
        v_actor_role,
        NEW.title,
        v_dept_name,
        jsonb_build_object('status', 'In Progress')
      );
    END LOOP;

  -- =========================================================================
  -- EVENT 3: STATUS CHANGE TO COMPLETED
  -- =========================================================================
  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'Completed' AND NEW.status = 'Completed' THEN
    IF NEW.created_by IS NOT NULL THEN
      SELECT u.id, u.full_name, u.role, u.department_id, d.name as dept_name
      INTO v_creator
      FROM public.users u
      LEFT JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = NEW.created_by;

      IF v_creator.dept_name IS NOT NULL THEN
        v_dept_name := v_creator.dept_name;
      END IF;
    END IF;

    -- Notify superiors / creator
    FOR v_recipient IN (
      SELECT id FROM public.users
      WHERE (
        role = 'Founder'
        OR (role IN ('Manager', 'Department Head') AND department_id = NEW.department_id)
        OR id = NEW.created_by
      )
      AND id != COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_approved = true
    ) LOOP
      PERFORM public.sync_task_notification(
        v_recipient.id,
        NEW.id,
        'TASK_COMPLETED',
        'Task Completed',
        v_dept_name || ' - ' || v_actor_name || ' completed task: "' || NEW.title || '".',
        'TASK_COMPLETED',
        '/task/' || NEW.id,
        v_current_user_id,
        v_actor_name,
        v_actor_role,
        NEW.title,
        v_dept_name,
        jsonb_build_object('status', 'Completed')
      );
    END LOOP;

  -- =========================================================================
  -- EVENT 4: TASK DELETED
  -- =========================================================================
  ELSIF TG_OP = 'DELETE' THEN
    -- If a task is completely deleted, we update all existing notifications related to this task.
    UPDATE public.in_app_notifications
    SET 
      entity_state = 'DELETED',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'deleted_by', v_current_user_id,
        'deleted_at', now(),
        'title', OLD.title,
        'department', v_dept_name
      ),
      type = 'TASK_DELETED',
      title = 'Task Deleted',
      message = v_actor_name || ' deleted task: "' || OLD.title || '".'
    WHERE entity_type IN ('TASK_ASSIGNED', 'TASK_SELF_ASSIGNED', 'DEADLINE_CHANGED', 'TASK_STARTED', 'TASK_COMPLETED')
      AND entity_id = OLD.id::text;
      
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
