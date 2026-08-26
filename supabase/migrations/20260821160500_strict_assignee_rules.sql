-- Migration: 20260821160500_strict_assignee_rules.sql
-- Description: Enforces that NO user can assign tasks to ANY Founder account, and NO user can self-assign.

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
    -- 1. Prevent self-assignment for all roles
    IF assigner_id = assignee_id THEN
        RETURN FALSE;
    END IF;

    SELECT role::text, department_id INTO assigner_role, assigner_dept 
    FROM public.users WHERE id = assigner_id;
    
    SELECT role::text, department_id INTO assignee_role, assignee_dept 
    FROM public.users WHERE id = assignee_id;

    -- 2. If assignee does not exist, reject
    IF assignee_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 3. Strict rule: NOBODY can assign tasks to a Founder (Founders delegate, not receive tasks)
    IF assignee_role = 'Founder' THEN
        RETURN FALSE;
    END IF;

    -- 4. Founder can assign to any non-Founder user
    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    -- 5. Department Head can assign to Managers and Employees (excluding Founder)
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    -- 6. Manager can assign to Managers and Employees (excluding Founder and Department Head)
    IF assigner_role = 'Manager' THEN
        RETURN assignee_role NOT IN ('Founder', 'Department Head');
    END IF;

    -- 7. Employee cannot assign tasks
    RETURN FALSE;
END;
$$;

NOTIFY pgrst, 'reload schema';
