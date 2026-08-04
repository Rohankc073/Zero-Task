-- Create Enum for Channel Types if not exists
DO $$ BEGIN
    CREATE TYPE channel_type AS ENUM ('public', 'department', 'management');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create chat_channels table
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type channel_type NOT NULL DEFAULT 'public',
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Add chat_messages to supabase_realtime publication
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

-- Seed Data: General Channel
INSERT INTO public.chat_channels (id, name, type) 
VALUES ('00000000-0000-0000-0000-000000000001', 'General', 'public')
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for chat_channels

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view authorized channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Founders can create channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Users can read messages in accessible channels" ON public.chat_messages;
    DROP POLICY IF EXISTS "Users can insert messages in accessible channels" ON public.chat_messages;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Unified SELECT policy for viewing channels based on role
CREATE POLICY "Users can view authorized channels" ON public.chat_channels
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND (
                -- Founders see everything
                role = 'Founder'
                -- Public channels are visible to everyone
                OR type = 'public'
                -- Management sees management channels
                OR (role IN ('Department Head', 'Manager') AND type = 'management')
                -- Users see their department's channels
                OR (department_id = public.users.department_id AND type = 'department')
            )
        )
    );

-- Founders can create channels
CREATE POLICY "Founders can create channels" ON public.chat_channels
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder')
    );

-- RLS Policies for chat_messages

-- Users can read messages in channels they can access
CREATE POLICY "Users can read messages in accessible channels" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_channels c
            WHERE c.id = chat_messages.channel_id
        )
    );

-- Users can insert messages in channels they can access
CREATE POLICY "Users can insert messages in accessible channels" ON public.chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.chat_channels c
            WHERE c.id = chat_messages.channel_id
        )
    );
