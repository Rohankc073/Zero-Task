-- Migration: 20260824000000_founder_dashboard_upgrade.sql
-- Description: Adds progress, completed_at, and enforces strict department isolation for tasks. Updates audit triggers.

-- 1. Add progress and completed_at columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'progress') THEN
        ALTER TABLE public.tasks ADD COLUMN progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'completed_at') THEN
        ALTER TABLE public.tasks ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Drop existing RLS policies on tasks
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

-- 3. Recreate Task RLS Policies with Strict Department Isolation

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
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      department_id IS NULL AND
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
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid()
  )
);

-- Department Head & Manager (INSERT)
CREATE POLICY "Management can insert tasks" ON public.tasks FOR INSERT
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) OR 
      department_id IS NULL -- In case they are permitted to create general tasks, though currently UI restricts to Founder
  )
);

-- Employee (INSERT)
CREATE POLICY "Employees can insert tasks" ON public.tasks FOR INSERT
WITH CHECK (
  public.get_auth_user_role() = 'Employee'
  AND department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
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
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      department_id IS NULL AND
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
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid()
  )
);

-- Delete policies
CREATE POLICY "Management can delete their created tasks" ON public.tasks FOR DELETE
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND created_by = auth.uid()
);

-- 4. Update audit_logs trigger to avoid noisy progress updates
CREATE OR REPLACE FUNCTION public.log_task_audit_events()
RETURNS trigger AS $$
DECLARE
    v_user_id UUID;
    v_action_type audit_action_type;
    v_description TEXT;
BEGIN
    v_user_id := auth.uid();
    
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'TASK_CREATE';
        v_description := 'Task created: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Skip noisy updates like purely progress changes
        IF OLD.progress IS DISTINCT FROM NEW.progress AND OLD.status = NEW.status AND OLD.title = NEW.title AND OLD.description = NEW.description THEN
            RETURN NEW;
        END IF;

        v_action_type := 'TASK_UPDATE';
        v_description := 'Task updated: ' || NEW.title || ' (ID: ' || NEW.id || ')';
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'TASK_DELETE';
        v_description := 'Task deleted: ' || OLD.title || ' (ID: ' || OLD.id || ')';
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (v_user_id, v_action_type, v_description);
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
