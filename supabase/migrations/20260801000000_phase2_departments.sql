-- Create departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read departments
CREATE POLICY "Anyone can view departments" ON public.departments
    FOR SELECT USING (true);

-- Allow only founders to manage departments
CREATE POLICY "Founders can manage departments" ON public.departments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'Founder'
        )
    );

-- Add department_id to users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'department_id') THEN
        ALTER TABLE public.users ADD COLUMN department_id UUID REFERENCES public.departments(id);
    END IF;
END $$;

-- Drop previous RLS policies on tasks dynamically to ensure a clean slate
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'tasks' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', pol.policyname);
    END LOOP;
END $$;

-- Re-enable RLS just in case
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 1. Founder Policy: ALL
CREATE POLICY "Founders have full access to all tasks" ON public.tasks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'Founder'
        )
    );

-- 2. Department Heads and Managers: SELECT, INSERT, UPDATE for their department
CREATE POLICY "Managers and Heads can view department tasks" ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users AS viewer
            WHERE viewer.id = auth.uid() 
            AND viewer.role IN ('Department Head', 'Manager')
            AND viewer.department_id = tasks.department_id
        )
    );

CREATE POLICY "Managers and Heads can insert department tasks" ON public.tasks
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users AS viewer
            WHERE viewer.id = auth.uid() 
            AND viewer.role IN ('Department Head', 'Manager')
            AND viewer.department_id = tasks.department_id
        )
    );

CREATE POLICY "Managers and Heads can update department tasks" ON public.tasks
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users AS viewer
            WHERE viewer.id = auth.uid() 
            AND viewer.role IN ('Department Head', 'Manager')
            AND viewer.department_id = tasks.department_id
        )
    );

-- 3. Employees: SELECT, UPDATE where task.user_id = auth.uid()
CREATE POLICY "Employees can view assigned tasks" ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users AS viewer
            WHERE viewer.id = auth.uid() 
            AND viewer.role = 'Employee'
            AND tasks.user_id = auth.uid()
        )
    );

CREATE POLICY "Employees can update assigned tasks" ON public.tasks
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users AS viewer
            WHERE viewer.id = auth.uid() 
            AND viewer.role = 'Employee'
            AND tasks.user_id = auth.uid()
        )
    );
