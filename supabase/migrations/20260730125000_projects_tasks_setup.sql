-- Create ENUMs for Project and Task Statuses if they do not exist
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('Active', 'On Hold', 'Completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('To Do', 'In Progress', 'Done');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('Low', 'Medium', 'High');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status project_status NOT NULL DEFAULT 'Active'::project_status,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project Members (Junction Table)
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'To Do'::task_status,
    priority task_priority NOT NULL DEFAULT 'Medium'::task_priority,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (from rls_audit_hardening or previous)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view projects they manage or are assigned to" ON public.projects;
    DROP POLICY IF EXISTS "Users can insert projects" ON public.projects;
    DROP POLICY IF EXISTS "Users can update projects they manage" ON public.projects;
    DROP POLICY IF EXISTS "Users can delete projects they manage" ON public.projects;
    
    DROP POLICY IF EXISTS "Users can view tasks assigned to them or in their projects" ON public.tasks;
    DROP POLICY IF EXISTS "Users can insert tasks if they are assigned or manager" ON public.tasks;
    DROP POLICY IF EXISTS "Users can update tasks they are assigned to or manage" ON public.tasks;
    DROP POLICY IF EXISTS "Users can delete tasks they manage" ON public.tasks;

    -- Add drops for the exact policy names used in this file:
    DROP POLICY IF EXISTS "Projects view access" ON public.projects;
    DROP POLICY IF EXISTS "Projects insert access" ON public.projects;
    DROP POLICY IF EXISTS "Projects update access" ON public.projects;
    DROP POLICY IF EXISTS "Projects delete access" ON public.projects;

    DROP POLICY IF EXISTS "Project members view access" ON public.project_members;
    DROP POLICY IF EXISTS "Project members modify access" ON public.project_members;

    DROP POLICY IF EXISTS "Tasks view access" ON public.tasks;
    DROP POLICY IF EXISTS "Tasks insert access" ON public.tasks;
    DROP POLICY IF EXISTS "Tasks update access" ON public.tasks;
    DROP POLICY IF EXISTS "Tasks delete access" ON public.tasks;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- RLS Policies for Projects
-- Users can view projects if they are the owner, a member, or have Founder/Dept Head role
CREATE POLICY "Projects view access"
ON public.projects FOR SELECT
USING (
  auth.uid() = owner_id OR
  EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- Users can insert projects
CREATE POLICY "Projects insert access"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Users can update/delete projects if they are the owner or Founder/Dept Head
CREATE POLICY "Projects update access"
ON public.projects FOR UPDATE
USING (
  auth.uid() = owner_id OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Projects delete access"
ON public.projects FOR DELETE
USING (
  auth.uid() = owner_id OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- RLS Policies for Project Members
CREATE POLICY "Project members view access"
ON public.project_members FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_members.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

CREATE POLICY "Project members modify access"
ON public.project_members FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_members.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- RLS Policies for Tasks
-- Users can view tasks if they are the assignee, the project owner, a project member, or Founder/Dept Head
CREATE POLICY "Tasks view access"
ON public.tasks FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = tasks.project_id AND project_members.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- Users can insert tasks if they are in the project or Founder/Dept Head
CREATE POLICY "Tasks insert access"
ON public.tasks FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = tasks.project_id AND project_members.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- Users can update tasks if they are assigned to it, in the project, or Founder/Dept Head
CREATE POLICY "Tasks update access"
ON public.tasks FOR UPDATE
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = tasks.project_id AND project_members.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);

-- Users can delete tasks if they are the project owner or Founder/Dept Head
CREATE POLICY "Tasks delete access"
ON public.tasks FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('Founder', 'Department Head'))
);
