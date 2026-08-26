-- Migration: 20260824000003_enforce_department_assignees.sql
-- Description: Creates a trigger to ensure that a task assignee belongs to the same department as the task if the task is a Department task.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_task_assignee_department()
RETURNS TRIGGER AS $$
DECLARE
  v_task_scope TEXT;
  v_task_department_id UUID;
  v_assignee_department_id UUID;
BEGIN
  -- Get the task scope and department_id
  SELECT scope, department_id INTO v_task_scope, v_task_department_id
  FROM public.tasks
  WHERE id = NEW.task_id;

  -- Only enforce this rule for Department tasks
  IF v_task_scope = 'Department' THEN
    
    -- Get the assignee's department_id
    SELECT department_id INTO v_assignee_department_id
    FROM public.users
    WHERE id = NEW.user_id;

    -- If the task has a department_id and the assignee's department doesn't match, raise an exception
    IF v_task_department_id IS NOT NULL AND (v_assignee_department_id IS NULL OR v_assignee_department_id != v_task_department_id) THEN
      RAISE EXCEPTION 'Cross-department assignment forbidden. Assignee must belong to the same department as the Department Task.';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS trg_enforce_task_assignee_department ON public.task_assignees;

-- Create the trigger on task_assignees before insert or update
CREATE TRIGGER trg_enforce_task_assignee_department
BEFORE INSERT OR UPDATE ON public.task_assignees
FOR EACH ROW
EXECUTE FUNCTION public.check_task_assignee_department();

COMMIT;
