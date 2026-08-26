-- Migration: 20260819000002_task_visibility_fix.sql
-- Description: Fixes task visibility rules (SELECT, UPDATE, DELETE) for all roles and prevents Manager over-privilege. Updates Employee trigger.

-- 0. Ensure can_assign_task exists (in case previous migrations were missed)
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
    SELECT role::text, department_id INTO assigner_role, assigner_dept FROM public.users WHERE id = assigner_id;
    SELECT role::text, department_id INTO assignee_role, assignee_dept FROM public.users WHERE id = assignee_id;

    IF assigner_role = 'Founder' THEN RETURN TRUE; END IF;
    IF assigner_role = 'Department Head' THEN RETURN assignee_role != 'Founder'; END IF;
    IF assigner_role = 'Manager' THEN RETURN assignee_dept = assigner_dept AND assignee_role = 'Employee'; END IF;
    RETURN FALSE;
END;
$$;

-- 1. Update Employee trigger to restrict more fields
CREATE OR REPLACE FUNCTION public.check_employee_task_update()
RETURNS trigger AS $$
DECLARE
    user_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    user_role := public.get_auth_user_role();

    IF user_role = 'Employee' THEN
        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            RAISE EXCEPTION 'Employees are not permitted to reassign tasks (user_id is immutable for this role).';
        END IF;

        IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
            RAISE EXCEPTION 'Employees are not permitted to change the department of a task.';
        END IF;

        IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION 'Employees are not permitted to move a task to a different project.';
        END IF;

        IF OLD.title IS DISTINCT FROM NEW.title THEN
            RAISE EXCEPTION 'Employees are not permitted to change task title.';
        END IF;

        IF OLD.description IS DISTINCT FROM NEW.description THEN
            RAISE EXCEPTION 'Employees are not permitted to change task description.';
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            RAISE EXCEPTION 'Employees are not permitted to change task priority.';
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            RAISE EXCEPTION 'Employees are not permitted to change task due date.';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
            RAISE EXCEPTION 'Employees are not permitted to change task creator.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Drop existing RLS policies on tasks
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;


-- 3. Recreate RLS Policies

-- Founder (ALL)
CREATE POLICY "Founders have full access to all tasks" ON public.tasks FOR ALL
USING (public.get_auth_user_role() = 'Founder');


-- Department Head & Manager (SELECT)
CREATE POLICY "Management can view permitted tasks" ON public.tasks FOR SELECT
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    user_id = auth.uid() OR 
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      EXISTS (
        SELECT 1 FROM public.users assignee 
        WHERE assignee.id = tasks.user_id 
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
);


-- Employee (SELECT)
CREATE POLICY "Employees can view assigned tasks" ON public.tasks FOR SELECT
USING (
  public.get_auth_user_role() = 'Employee'
  AND (
    user_id = auth.uid() OR created_by = auth.uid()
  )
);


-- Department Head & Manager (INSERT)
CREATE POLICY "Management can insert tasks" ON public.tasks FOR INSERT
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND public.can_assign_task(user_id, auth.uid())
);


-- Department Head & Manager (UPDATE)
CREATE POLICY "Management can update permitted tasks" ON public.tasks FOR UPDATE
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    user_id = auth.uid() OR 
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      EXISTS (
        SELECT 1 FROM public.users assignee 
        WHERE assignee.id = tasks.user_id 
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
)
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND public.can_assign_task(user_id, auth.uid())
);


-- Employee (UPDATE)
CREATE POLICY "Employees can update assigned tasks" ON public.tasks FOR UPDATE
USING (
  public.get_auth_user_role() = 'Employee'
  AND user_id = auth.uid()
)
WITH CHECK (
  public.get_auth_user_role() = 'Employee'
  AND user_id = auth.uid()
);


-- Department Head & Manager (DELETE)
CREATE POLICY "Management can delete permitted tasks" ON public.tasks FOR DELETE
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      EXISTS (
        SELECT 1 FROM public.users assignee 
        WHERE assignee.id = tasks.user_id 
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
);
