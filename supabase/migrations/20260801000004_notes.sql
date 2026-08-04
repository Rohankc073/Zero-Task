-- Create user_notes table
CREATE TABLE IF NOT EXISTS public.user_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    content TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can only view their own notes" ON public.user_notes;
    DROP POLICY IF EXISTS "Users can only insert their own notes" ON public.user_notes;
    DROP POLICY IF EXISTS "Users can only update their own notes" ON public.user_notes;
    DROP POLICY IF EXISTS "Users can only delete their own notes" ON public.user_notes;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Create strict policies for isolating notes
CREATE POLICY "Users can only view their own notes"
    ON public.user_notes
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own notes"
    ON public.user_notes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own notes"
    ON public.user_notes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own notes"
    ON public.user_notes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Optional: Enable Realtime for the user_notes table
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notes;
  END IF;
END $$;
