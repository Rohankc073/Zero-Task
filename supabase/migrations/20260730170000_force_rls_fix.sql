-- Migration: 20260730170000_force_rls_fix.sql
-- Description: Drops all policies on projects, project_members, and tasks and recreates them using non-recursive patterns.

-- 1. Drop all existing policies on these tables to start clean
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('projects', 'project_members', 'tasks')) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Helper function to break recursion when querying the users table
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role FROM public.users WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Projects Policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects view access"
ON public.projects FOR SELECT
USING (
  owner_id = auth.uid() OR
  id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()) OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);

CREATE POLICY "Projects insert access"
ON public.projects FOR INSERT
WITH CHECK (
  owner_id = auth.uid() OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);

CREATE POLICY "Projects update access"
ON public.projects FOR UPDATE
USING (
  owner_id = auth.uid() OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);

CREATE POLICY "Projects delete access"
ON public.projects FOR DELETE
USING (
  owner_id = auth.uid() OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);


-- 4. Project Members Policies
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ANY authenticated user can view project members (Breaks the cycle!)
CREATE POLICY "Project members view access"
ON public.project_members FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Project members insert access"
ON public.project_members FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);

CREATE POLICY "Project members update access"
ON public.project_members FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);

CREATE POLICY "Project members delete access"
ON public.project_members FOR DELETE
USING (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  public.get_auth_user_role() IN ('Founder', 'Department Head')
);


-- 5. Tasks Policies
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks are viewable by assigned users, project members, or management"
ON public.tasks FOR SELECT
USING (
  user_id = auth.uid()
  OR project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

CREATE POLICY "Tasks can be created by project members or management"
ON public.tasks FOR INSERT
WITH CHECK (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

CREATE POLICY "Tasks can be updated by project members or management"
ON public.tasks FOR UPDATE
USING (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);

CREATE POLICY "Tasks can be deleted by project members or management"
ON public.tasks FOR DELETE
USING (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  OR public.get_auth_user_role() IN ('Founder', 'Department Head', 'Manager')
);
