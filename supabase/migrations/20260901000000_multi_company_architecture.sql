-- Phase 1: Database Schema & RLS Hardening (Multi-Company Architecture)

-- 1. Ensure companies table has status
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended'));

-- 2. Create the get_auth_user_company_id helper
CREATE OR REPLACE FUNCTION public.get_auth_user_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT company_id FROM public.users WHERE id = auth.uid();
$$;

-- 3. Backfill data and add missing company_id
DO $$ 
DECLARE
    default_company_id uuid;
BEGIN
    SELECT id INTO default_company_id FROM public.companies ORDER BY created_at ASC LIMIT 1;
    IF default_company_id IS NULL THEN
        INSERT INTO public.companies (name) VALUES ('Initial Default Company') RETURNING id INTO default_company_id;
    END IF;

    -- Update users, tasks, departments, designations that might have NULL company_id
    UPDATE public.users SET company_id = default_company_id WHERE company_id IS NULL AND role != 'Super Admin';
    UPDATE public.departments SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE public.designations SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE public.tasks SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE public.projects SET company_id = default_company_id WHERE company_id IS NULL;

    -- Add company_id to meetings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'company_id') THEN
        ALTER TABLE public.meetings ADD COLUMN company_id uuid REFERENCES public.companies(id);
        UPDATE public.meetings SET company_id = default_company_id;
        ALTER TABLE public.meetings ALTER COLUMN company_id SET NOT NULL;
    END IF;

    -- Add company_id to chat_channels
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_channels' AND column_name = 'company_id') THEN
        ALTER TABLE public.chat_channels ADD COLUMN company_id uuid REFERENCES public.companies(id);
        UPDATE public.chat_channels SET company_id = default_company_id;
        ALTER TABLE public.chat_channels ALTER COLUMN company_id SET NOT NULL;
    END IF;

    -- Add company_id to audit_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'company_id') THEN
        ALTER TABLE public.audit_logs ADD COLUMN company_id uuid REFERENCES public.companies(id);
        UPDATE public.audit_logs SET company_id = default_company_id;
        ALTER TABLE public.audit_logs ALTER COLUMN company_id SET NOT NULL;
    END IF;
END $$;

-- 4. Update RLS Policies to strictly enforce company isolation
-- Note: Super Admins bypass some policies via the get_auth_user_role() function if they need to see companies/founders

-- Users
DROP POLICY IF EXISTS "Users can view users in same company" ON public.users;
CREATE POLICY "Users can view users in same company" ON public.users
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id() OR
        public.get_auth_user_role() = 'Super Admin'
    );

-- Tasks
DROP POLICY IF EXISTS "Users can view company tasks" ON public.tasks;
CREATE POLICY "Users can view company tasks" ON public.tasks
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id()
    );

-- Meetings
DROP POLICY IF EXISTS "Users can view company meetings" ON public.meetings;
CREATE POLICY "Users can view company meetings" ON public.meetings
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id()
    );

-- Projects
DROP POLICY IF EXISTS "Users can view company projects" ON public.projects;
CREATE POLICY "Users can view company projects" ON public.projects
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id()
    );

-- Departments
DROP POLICY IF EXISTS "Users can view company departments" ON public.departments;
CREATE POLICY "Users can view company departments" ON public.departments
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id()
    );

-- Chat Channels
DROP POLICY IF EXISTS "Users can view company chat channels" ON public.chat_channels;
CREATE POLICY "Users can view company chat channels" ON public.chat_channels
    FOR SELECT USING (
        company_id = public.get_auth_user_company_id()
    );

-- Audit Logs
DROP POLICY IF EXISTS "Super Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Super Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        public.get_auth_user_role() = 'Super Admin'
    );
