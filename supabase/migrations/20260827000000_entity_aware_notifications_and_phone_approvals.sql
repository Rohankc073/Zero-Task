-- Migration: 20260827000000_entity_aware_notifications_and_phone_approvals.sql
-- Description: Entity-aware & state-aware notification engine, task lifecycle synchronization, and phone approval architecture.

BEGIN;

--------------------------------------------------------------------------------
-- 1. Schema Enhancements for in_app_notifications
--------------------------------------------------------------------------------
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'TASK';
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS entity_title TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS actor_role TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS department_name TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS entity_state TEXT;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.in_app_notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_notifs_user_task ON public.in_app_notifications(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user_updated ON public.in_app_notifications(user_id, is_read, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifs_task_id ON public.in_app_notifications(task_id);

--------------------------------------------------------------------------------
-- 2. Centralized State Synchronization Function
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_task_notification(
  p_recipient_id UUID,
  p_task_id UUID,
  p_entity_state TEXT,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_action_url TEXT,
  p_actor_id UUID,
  p_actor_name TEXT,
  p_actor_role TEXT,
  p_entity_title TEXT,
  p_dept_name TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif_id UUID;
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Locate existing notification for this task and recipient
  IF p_task_id IS NOT NULL THEN
    SELECT id INTO v_notif_id
    FROM public.in_app_notifications
    WHERE user_id = p_recipient_id AND task_id = p_task_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_notif_id IS NOT NULL THEN
    UPDATE public.in_app_notifications
    SET
      title = p_title,
      message = p_message,
      type = p_type,
      action_url = p_action_url,
      entity_state = p_entity_state,
      actor_id = p_actor_id,
      actor_name = p_actor_name,
      actor_role = p_actor_role,
      entity_title = p_entity_title,
      department_name = p_dept_name,
      metadata = COALESCE(in_app_notifications.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
      is_read = false,
      updated_at = now()
    WHERE id = v_notif_id;
    RETURN v_notif_id;
  ELSE
    INSERT INTO public.in_app_notifications (
      user_id,
      task_id,
      entity_type,
      entity_id,
      entity_state,
      title,
      message,
      type,
      action_url,
      actor_id,
      actor_name,
      actor_role,
      entity_title,
      department_name,
      metadata,
      is_read,
      created_at,
      updated_at
    ) VALUES (
      p_recipient_id,
      p_task_id,
      'TASK',
      p_task_id,
      p_entity_state,
      p_title,
      p_message,
      p_type,
      p_action_url,
      p_actor_id,
      p_actor_name,
      p_actor_role,
      p_entity_title,
      p_dept_name,
      COALESCE(p_metadata, '{}'::jsonb),
      false,
      now(),
      now()
    ) RETURNING id INTO v_notif_id;
    RETURN v_notif_id;
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 3. Trigger on task_assignees: Handles Assignments & Self-Assignments
--------------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_notify_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_notify_task_assignee
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_assignee();

--------------------------------------------------------------------------------
-- 4. Trigger on tasks for Status, Deadline, and Deletion Lifecycle
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_task_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor RECORD;
  v_creator RECORD;
  v_dept_name TEXT := 'General';
  v_old_date_str TEXT := 'None';
  v_new_date_str TEXT := 'None';
  v_recipient RECORD;
  v_current_user_id UUID;
  v_actor_name TEXT := 'A team member';
  v_actor_role TEXT := 'User';
BEGIN
  v_current_user_id := auth.uid();

  -- Fetch actor information
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
  -- EVENT 3: TASK COMPLETION
  -- =========================================================================
  ELSIF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM 'Done' AND NEW.status = 'Done') THEN
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
        jsonb_build_object('status', 'Done', 'completed_at', now())
      );
    END LOOP;

  -- =========================================================================
  -- EVENT 4: TASK DELETION
  -- =========================================================================
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.department_id IS NOT NULL THEN
      SELECT name INTO v_dept_name FROM public.departments WHERE id = OLD.department_id;
    END IF;

    -- In-place update all existing notifications referencing this task_id
    UPDATE public.in_app_notifications
    SET
      entity_state = 'TASK_DELETED',
      title = 'Task Deleted',
      message = COALESCE(v_dept_name, 'General') || ' - ' || v_actor_name || ' deleted task: "' || OLD.title || '".',
      type = 'TASK_DELETED',
      action_url = NULL,
      actor_id = v_current_user_id,
      actor_name = v_actor_name,
      actor_role = v_actor_role,
      entity_title = OLD.title,
      department_name = COALESCE(v_dept_name, 'General'),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'deleted_by', v_actor_name,
        'deleted_at', now(),
        'original_title', OLD.title,
        'department', COALESCE(v_dept_name, 'General'),
        'creator_id', OLD.created_by
      ),
      is_read = false,
      updated_at = now()
    WHERE task_id = OLD.id;

    -- Also ensure Founders receive organizational deletion alert if they didn't have one
    FOR v_recipient IN (
      SELECT id FROM public.users
      WHERE role = 'Founder'
      AND id != COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.in_app_notifications
        WHERE user_id = users.id AND task_id = OLD.id
      )
    ) LOOP
      INSERT INTO public.in_app_notifications (
        user_id,
        task_id,
        entity_type,
        entity_id,
        entity_state,
        title,
        message,
        type,
        action_url,
        actor_id,
        actor_name,
        actor_role,
        entity_title,
        department_name,
        metadata,
        is_read,
        created_at,
        updated_at
      ) VALUES (
        v_recipient.id,
        OLD.id,
        'TASK',
        OLD.id,
        'TASK_DELETED',
        'Task Deleted',
        COALESCE(v_dept_name, 'General') || ' - ' || v_actor_name || ' deleted task: "' || OLD.title || '".',
        'TASK_DELETED',
        NULL,
        v_current_user_id,
        v_actor_name,
        v_actor_role,
        OLD.title,
        COALESCE(v_dept_name, 'General'),
        jsonb_build_object(
          'deleted_by', v_actor_name,
          'deleted_at', now(),
          'original_title', OLD.title,
          'department', COALESCE(v_dept_name, 'General'),
          'creator_id', OLD.created_by
        ),
        false,
        now(),
        now()
      );
    END LOOP;

    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_events ON public.tasks;
CREATE TRIGGER trg_notify_task_events
AFTER UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_events();

--------------------------------------------------------------------------------
-- 5. Phone Change Approval Hardening & Notifications
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_phone_change_approval(
    p_request_id UUID,
    p_decision TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_approver_id UUID := auth.uid();
    v_approver_role public.user_role_enum;
    v_approver_name TEXT;
BEGIN
    IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, full_name INTO v_approver_role, v_approver_name FROM public.users WHERE id = v_approver_id;

    -- Fetch request
    SELECT * INTO v_req FROM public.phone_change_requests WHERE id = p_request_id FOR UPDATE;
    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_req.status != 'Pending' THEN
        RAISE EXCEPTION 'Request has already been processed.';
    END IF;

    -- Permission check: must be assigned approver or Founder
    IF v_req.approver_id != v_approver_id AND v_approver_role != 'Founder' THEN
        RAISE EXCEPTION 'You do not have permission to approve this request.';
    END IF;

    IF p_decision = 'Approved' THEN
        -- 1. Update user profile phone number
        UPDATE public.users
        SET phone_number = v_req.new_phone_number
        WHERE id = v_req.user_id;

        -- 2. Update request status
        UPDATE public.phone_change_requests
        SET status = 'Approved', resolved_at = now(), resolved_by = v_approver_id
        WHERE id = p_request_id;

        -- 3. Notify requester
        INSERT INTO public.in_app_notifications (
          user_id, entity_type, entity_id, entity_state, title, message, type, is_read, created_at, updated_at
        ) VALUES (
          v_req.user_id,
          'PHONE_CHANGE',
          p_request_id,
          'APPROVED',
          'Phone Number Updated',
          'Your phone number has been updated to ' || v_req.new_phone_number || ' by ' || COALESCE(v_approver_name, 'your supervisor') || '.',
          'PHONE_APPROVED',
          false,
          now(),
          now()
        );

        -- 4. Audit log
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (
            v_approver_id,
            'USER_APPROVED',
            'Approved phone number change for user ' || v_req.user_id || ' to ' || v_req.new_phone_number
        );
    ELSIF p_decision = 'Rejected' THEN
        UPDATE public.phone_change_requests
        SET status = 'Rejected', resolved_at = now(), resolved_by = v_approver_id
        WHERE id = p_request_id;

        -- Notify requester
        INSERT INTO public.in_app_notifications (
          user_id, entity_type, entity_id, entity_state, title, message, type, is_read, created_at, updated_at
        ) VALUES (
          v_req.user_id,
          'PHONE_CHANGE',
          p_request_id,
          'REJECTED',
          'Phone Change Request Rejected',
          'Your request to change phone number to ' || v_req.new_phone_number || ' was rejected by ' || COALESCE(v_approver_name, 'your supervisor') || '.',
          'PHONE_REJECTED',
          false,
          now(),
          now()
        );
    ELSE
        RAISE EXCEPTION 'Invalid decision. Must be Approved or Rejected.';
    END IF;

    RETURN TRUE;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
