-- Ensure public.departments exists (in case earlier migrations were skipped)
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create channel type ENUM
DO $$ BEGIN
    CREATE TYPE channel_type AS ENUM ('public', 'department', 'management');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create chat_channels table
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type channel_type NOT NULL DEFAULT 'public'::channel_type,
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Channels RLS Policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "Founders can view all channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Management can view management and public channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Users can view their department channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Everyone can view public channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "View messages in accessible channels" ON public.chat_messages;
    DROP POLICY IF EXISTS "Insert messages in accessible channels" ON public.chat_messages;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
CREATE POLICY "Founders can view all channels" 
ON public.chat_channels FOR SELECT
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder'));

CREATE POLICY "Management can view management and public channels" 
ON public.chat_channels FOR SELECT
USING (
  type IN ('public', 'management') AND 
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Manager', 'Department Head'))
);

CREATE POLICY "Users can view their department channels" 
ON public.chat_channels FOR SELECT
USING (
  type = 'department' AND 
  department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Everyone can view public channels" 
ON public.chat_channels FOR SELECT
USING (type = 'public');

-- Messages RLS Policies
-- Users can view messages if they have access to the channel (which is enforced by the channel RLS above)
CREATE POLICY "View messages in accessible channels" 
ON public.chat_messages FOR SELECT
USING (
  channel_id IN (SELECT id FROM public.chat_channels)
);

-- Users can insert messages in channels they have access to
CREATE POLICY "Insert messages in accessible channels" 
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  channel_id IN (SELECT id FROM public.chat_channels)
);

-- Enable Supabase Realtime for chat_messages
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END $$;

-- Seed Default 'General' Channel
INSERT INTO public.chat_channels (id, name, type)
VALUES ('00000000-0000-0000-0000-000000000001', 'General', 'public')
ON CONFLICT (id) DO NOTHING;
