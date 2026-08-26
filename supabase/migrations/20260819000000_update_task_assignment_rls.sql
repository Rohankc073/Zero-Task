-- Migration: 20260819000000_update_task_assignment_rls.sql
-- Description: Updates the task assignment validation function to allow Department Heads to assign tasks to anyone except Founders.

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
    -- Fetch the assigner info
    SELECT role::text, department_id INTO assigner_role, assigner_dept 
    FROM public.users WHERE id = assigner_id;
    
    -- Fetch the assignee info
    SELECT role::text, department_id INTO assignee_role, assignee_dept 
    FROM public.users WHERE id = assignee_id;

    -- Founder can assign to anyone
    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    -- Department Head can assign to anyone EXCEPT Founder
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    -- Manager can assign to Employees in their department
    IF assigner_role = 'Manager' THEN
        RETURN assignee_dept = assigner_dept AND assignee_role = 'Employee';
    END IF;

    -- Employees cannot assign/insert tasks at all (handled by policies below)
    RETURN FALSE;
END;
$$;
