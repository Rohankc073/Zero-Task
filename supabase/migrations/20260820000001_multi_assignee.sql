-- Migration: 20260820000001_multi_assignee.sql

-- 1. Create task_assignees table
CREATE TABLE IF NOT EXISTS public.task_assignees (
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

-- Enable RLS
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- 2. Migrate existing assignments
INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, user_id FROM public.tasks WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Note: We are keeping tasks.user_id for now as nullable to prevent breaking completely untested frontend areas, 
-- but we will rely on task_assignees. We will stop enforcing user_id NOT NULL if it was.
ALTER TABLE public.tasks ALTER COLUMN user_id DROP NOT NULL;

-- 3. Update Employee task update trigger
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
        -- user_id removed from this check since they can't touch task_assignees via RLS anyway
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


-- 4. Recreate Task RLS Policies
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

-- Founder (ALL)
CREATE POLICY "Founders have full access to all tasks" ON public.tasks FOR ALL
USING (public.get_auth_user_role() = 'Founder');


-- Department Head & Manager (SELECT)
CREATE POLICY "Management can view permitted tasks" ON public.tasks FOR SELECT
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      EXISTS (
        SELECT 1 FROM public.task_assignees ta
        JOIN public.users assignee ON ta.user_id = assignee.id
        WHERE ta.task_id = tasks.id 
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
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR created_by = auth.uid()
  )
);


-- Department Head & Manager (INSERT)
-- (We allow inserting the task, task_assignees will have its own policy for assignees)
CREATE POLICY "Management can insert tasks" ON public.tasks FOR INSERT
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
);


-- Department Head & Manager (UPDATE)
CREATE POLICY "Management can update permitted tasks" ON public.tasks FOR UPDATE
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      EXISTS (
        SELECT 1 FROM public.task_assignees ta
        JOIN public.users assignee ON ta.user_id = assignee.id
        WHERE ta.task_id = tasks.id 
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
);

-- Employee (UPDATE)
CREATE POLICY "Employees can update assigned tasks" ON public.tasks FOR UPDATE
USING (
  public.get_auth_user_role() = 'Employee'
  AND EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid())
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
        SELECT 1 FROM public.task_assignees ta
        JOIN public.users assignee ON ta.user_id = assignee.id
        WHERE ta.task_id = tasks.id 
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
);

-- 5. RLS for task_assignees
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_assignees') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.task_assignees', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Founders have full access to task_assignees" ON public.task_assignees FOR ALL
USING (public.get_auth_user_role() = 'Founder');

CREATE POLICY "Users can view task_assignees for tasks they can see" ON public.task_assignees FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id) -- relying on tasks SELECT policy
);

CREATE POLICY "Management can insert task_assignees" ON public.task_assignees FOR INSERT
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND public.can_assign_task(user_id, auth.uid())
);

CREATE POLICY "Management can delete task_assignees" ON public.task_assignees FOR DELETE
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
);
