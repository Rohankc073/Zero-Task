-- Migration: 20260825000007_fix_task_scope_column.sql
-- Description: Adds scope column to tasks table and updates check_task_assignee_department function to prevent column not found errors.

BEGIN;

-- 1. Add scope column to tasks table if it does not exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'Department';

-- 2. Update check_task_assignee_department trigger function
CREATE OR REPLACE FUNCTION public.check_task_assignee_department()
RETURNS TRIGGER AS $$
DECLARE
  v_task_department_id UUID;
  v_assignee_department_id UUID;
  v_assignee_role TEXT;
BEGIN
  -- Get the task department_id
  SELECT department_id INTO v_task_department_id
  FROM public.tasks
  WHERE id = NEW.task_id;

  -- Only enforce this rule if the task is explicitly tied to a department
  IF v_task_department_id IS NOT NULL THEN
    
    -- Get the assignee's department_id and role
    SELECT department_id, role INTO v_assignee_department_id, v_assignee_role
    FROM public.users
    WHERE id = NEW.user_id;

    -- Founders are exempt; all other assignees must match the task's department
    IF v_assignee_role IS DISTINCT FROM 'Founder' AND (v_assignee_department_id IS NULL OR v_assignee_department_id != v_task_department_id) THEN
      RAISE EXCEPTION 'Cross-department assignment forbidden. Assignee must belong to the same department as the Department Task.';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
