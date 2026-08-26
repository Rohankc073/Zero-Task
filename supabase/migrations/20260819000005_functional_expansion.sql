-- Migration: 20260819000005_functional_expansion.sql
-- Description: Adds schema for Execution Tree, Milestones, and Activity.

-- 1. Projects updates
ALTER TABLE IF EXISTS public.projects 
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 2. Project Milestones
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    status task_status NOT NULL DEFAULT 'To Do'::task_status,
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view milestones if they can view the project" ON public.project_milestones;
    DROP POLICY IF EXISTS "Management can manage milestones" ON public.project_milestones;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Project Milestones RLS (Same as tasks visibility)
CREATE POLICY "Users can view milestones if they can view the project"
ON public.project_milestones FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_milestones.project_id AND (
    projects.owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head', 'Manager'))
  ))
);

CREATE POLICY "Management can manage milestones"
ON public.project_milestones FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head', 'Manager'))
);

-- 3. Tasks updates
ALTER TABLE IF EXISTS public.tasks 
ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 4. Execution Activity (Timeline)
CREATE TABLE IF NOT EXISTS public.execution_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.execution_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view execution activity if they can view the entity" ON public.execution_activity;
    DROP POLICY IF EXISTS "Authenticated users can insert execution activity" ON public.execution_activity;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can view execution activity if they can view the entity"
ON public.execution_activity FOR SELECT
USING (
  (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks WHERE id = task_id AND (
      user_id = auth.uid() OR created_by = auth.uid() OR
      EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head', 'Manager'))
    )
  ))
  OR (project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects WHERE id = project_id AND (
      owner_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head', 'Manager'))
    )
  ))
  OR (milestone_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.project_milestones WHERE id = milestone_id AND (
      owner_id = auth.uid() OR created_by = auth.uid() OR
      EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head', 'Manager'))
    )
  ))
);

CREATE POLICY "Authenticated users can insert execution activity"
ON public.execution_activity FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
