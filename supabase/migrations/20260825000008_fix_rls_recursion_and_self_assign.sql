-- Migration: 20260825000008_fix_rls_recursion_and_self_assign.sql
-- Description: Breaks infinite recursion between tasks and task_assignees policies, and allows self-assignment in can_assign_task.

BEGIN;

-- 1. Drop the recursive SELECT policy on task_assignees that queries tasks
DROP POLICY IF EXISTS "Execution Team can view assignees for their tasks" ON public.task_assignees;
DROP POLICY IF EXISTS "Users can view task_assignees for tasks they can see" ON public.task_assignees;
DROP POLICY IF EXISTS "Authenticated users can view task_assignees" ON public.task_assignees;

-- 2. Create non-recursive SELECT policy on task_assignees
CREATE POLICY "Authenticated users can view task_assignees"
ON public.task_assignees FOR SELECT
TO authenticated
USING (true);

-- 3. Update can_assign_task to permit self-assignment for all valid roles
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
    -- Allow self-assignment
    IF assigner_id = assignee_id THEN
        RETURN TRUE;
    END IF;

    SELECT role::text, department_id INTO assigner_role, assigner_dept 
    FROM public.users WHERE id = assigner_id;
    
    SELECT role::text, department_id INTO assignee_role, assignee_dept 
    FROM public.users WHERE id = assignee_id;

    -- If assignee does not exist, reject
    IF assignee_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Strict rule: NOBODY can assign tasks to a Founder (Founders delegate, not receive tasks from others)
    IF assignee_role = 'Founder' THEN
        RETURN FALSE;
    END IF;

    -- Founder can assign to any non-Founder user
    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    -- Department Head can assign to Managers and Employees (excluding Founder)
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    -- Manager can assign to Managers and Employees (excluding Founder and Department Head)
    IF assigner_role = 'Manager' THEN
        RETURN assignee_role NOT IN ('Founder', 'Department Head');
    END IF;

    -- Employee cannot assign to others
    RETURN FALSE;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
