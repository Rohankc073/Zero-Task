-- Phase 2: Execution Team Account and Portal

-- 1. Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add company_id to users, tasks, projects
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. RLS for companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view companies" ON public.companies;
CREATE POLICY "Anyone can view companies"
ON public.companies FOR SELECT
USING (true);

-- 4. RLS for Execution Team on Tasks
DROP POLICY IF EXISTS "Execution Team can view their company tasks" ON public.tasks;
CREATE POLICY "Execution Team can view their company tasks"
ON public.tasks FOR SELECT
USING (
    get_auth_user_role() = 'Execution Team'
    AND company_id = (SELECT company_id FROM public.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Execution Team can update their company tasks" ON public.tasks;
CREATE POLICY "Execution Team can update their company tasks"
ON public.tasks FOR UPDATE
USING (
    get_auth_user_role() = 'Execution Team'
    AND company_id = (SELECT company_id FROM public.users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Execution Team can view assignees for their tasks" ON public.task_assignees;
CREATE POLICY "Execution Team can view assignees for their tasks"
ON public.task_assignees FOR SELECT
USING (
    get_auth_user_role() = 'Execution Team'
    AND EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = task_assignees.task_id
        AND tasks.company_id = (SELECT company_id FROM public.users WHERE id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Founder can manage companies" ON public.companies;
CREATE POLICY "Founder can manage companies"
ON public.companies FOR ALL
USING (get_auth_user_role() = 'Founder');

