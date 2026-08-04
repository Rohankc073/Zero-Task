-- ENUMs for Alerts and Milestones
DO $$ BEGIN
    CREATE TYPE alert_type AS ENUM ('Milestone', 'Critical', 'System');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE milestone_type AS ENUM ('Early Completion', 'Streak', 'High Priority Close');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table: user_integrations
CREATE TABLE IF NOT EXISTS public.user_integrations (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    gcal_access_token TEXT,
    gcal_refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage their own integrations" ON public.user_integrations;
    DROP POLICY IF EXISTS "Anyone can view department or global alerts" ON public.system_alerts;
    DROP POLICY IF EXISTS "Anyone can insert alerts" ON public.system_alerts;
    DROP POLICY IF EXISTS "Users can view their own milestones" ON public.task_milestones;
    DROP POLICY IF EXISTS "Users can insert their own milestones" ON public.task_milestones;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can manage their own integrations"
    ON public.user_integrations
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Table: system_alerts
CREATE TABLE IF NOT EXISTS public.system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type alert_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view department or global alerts"
    ON public.system_alerts
    FOR SELECT
    USING (
        department_id IS NULL OR 
        department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Management'))
    );

CREATE POLICY "Anyone can insert alerts"
    ON public.system_alerts
    FOR INSERT
    WITH CHECK (true);

-- Table: task_milestones
CREATE TABLE IF NOT EXISTS public.task_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    milestone_type milestone_type NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.task_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own milestones"
    ON public.task_milestones
    FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head', 'Manager'))
    );

CREATE POLICY "Users can insert their own milestones"
    ON public.task_milestones
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Enable Realtime for system_alerts
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'system_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_alerts;
  END IF;
END $$;
