-- 1. Clean the Slate (Drop Policies)
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

-- 2. Create a Helper Function
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role FROM public.users WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Write Non-Recursive Policies for tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
CREATE POLICY "Tasks are viewable by assigned users, project members, or management"
ON public.tasks FOR SELECT
USING (
  user_id = auth.uid()
  OR project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

-- INSERT Policy
CREATE POLICY "Tasks can be created by project members or management"
ON public.tasks FOR INSERT
WITH CHECK (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

-- UPDATE Policy
CREATE POLICY "Tasks can be updated by project members or management"
ON public.tasks FOR UPDATE
USING (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

-- DELETE Policy
CREATE POLICY "Tasks can be deleted by project members or management"
ON public.tasks FOR DELETE
USING (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);
