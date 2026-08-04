-- Migration: 20260730133500_fix_rls_recursion.sql
-- Description: Fixes infinite recursion in RLS policies for projects, project_members, and tasks by using security definer functions.

-- 1. Ensure project_members table exists before policies
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing problematic policies
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('projects', 'project_members', 'tasks')) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3. Recreate Projects Policies (No Circular Dependencies)
CREATE POLICY "Projects view access"
ON public.projects FOR SELECT
USING (
  owner_id = auth.uid() OR
  id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Projects insert access"
ON public.projects FOR INSERT
WITH CHECK (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Projects update access"
ON public.projects FOR UPDATE
USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Projects delete access"
ON public.projects FOR DELETE
USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

-- 4. Recreate Project Members Policies
-- ANY authenticated user can view project members (Breaks the cycle!)
CREATE POLICY "Project members view access"
ON public.project_members FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Project members insert access"
ON public.project_members FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Project members update access"
ON public.project_members FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Project members delete access"
ON public.project_members FOR DELETE
USING (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

-- 5. Recreate Tasks Policies
CREATE POLICY "Tasks view access"
ON public.tasks FOR SELECT
USING (
  user_id = auth.uid() OR
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()) OR
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Tasks insert access"
ON public.tasks FOR INSERT
WITH CHECK (
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()) OR
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Tasks update access"
ON public.tasks FOR UPDATE
USING (
  user_id = auth.uid() OR
  project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()) OR
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Tasks delete access"
ON public.tasks FOR DELETE
USING (
  project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head'))
);
