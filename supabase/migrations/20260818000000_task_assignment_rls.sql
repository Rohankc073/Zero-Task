-- Migration: 20260818000000_task_assignment_rls.sql
-- Description: Replaces tasks table RLS INSERT and UPDATE policies to enforce role-based assignment rules securely at the database level.

-- 1. Create helper function for validating assignment scope
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

    -- Department Head can assign to Managers and Employees in their department
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_dept = assigner_dept AND assignee_role IN ('Manager', 'Employee');
    END IF;

    -- Manager can assign to Employees in their department
    IF assigner_role = 'Manager' THEN
        RETURN assignee_dept = assigner_dept AND assignee_role = 'Employee';
    END IF;

    -- Employees cannot assign/insert tasks at all (handled by policies below)
    RETURN FALSE;
END;
$$;

-- 2. Drop existing INSERT and UPDATE policies on tasks
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
      SELECT policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'tasks' AND cmd IN ('INSERT', 'UPDATE')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

-- 3. Recreate INSERT and UPDATE policies

-- INSERT Policy:
-- Founder can insert anything (assigned to anyone, due to function).
-- Managers and Heads can insert within their department and valid assignee.
CREATE POLICY "Tasks can be created by management with assignment rules" 
ON public.tasks FOR INSERT
WITH CHECK (
  (
    public.get_auth_user_role() = 'Founder'
    OR
    (
      public.get_auth_user_role() IN ('Department Head', 'Manager')
      AND department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
    )
  )
  AND public.can_assign_task(user_id, auth.uid())
);

-- UPDATE Policy:
-- Same access for updates, but ensures that if `user_id` is modified, it's still a valid assignment.
CREATE POLICY "Tasks can be updated by management with assignment rules"
ON public.tasks FOR UPDATE
USING (
  public.get_auth_user_role() = 'Founder'
  OR
  (
    public.get_auth_user_role() IN ('Department Head', 'Manager')
    AND department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
  )
)
WITH CHECK (
  (
    public.get_auth_user_role() = 'Founder'
    OR
    (
      public.get_auth_user_role() IN ('Department Head', 'Manager')
      AND department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
    )
  )
  AND public.can_assign_task(user_id, auth.uid())
);

-- (Note: Employees are explicitly excluded from INSERT. Their previous UPDATE policy was dropped and they are currently excluded from updating unless they had a separate Employee update policy. Let's make sure we restore Employee update policy for their own tasks if they had one!)

-- Restore Employee UPDATE policy that was dropped
CREATE POLICY "Employees can update assigned tasks" ON public.tasks
FOR UPDATE
USING (
    public.get_auth_user_role() = 'Employee'
    AND user_id = auth.uid()
)
WITH CHECK (
    public.get_auth_user_role() = 'Employee'
    AND user_id = auth.uid()
);
