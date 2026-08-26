-- 1. Create meeting_attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting_attachments', 'meeting_attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public Access meeting_attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated Upload meeting_attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own uploads meeting_attachments" ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Policy for reading public bucket
CREATE POLICY "Public Access meeting_attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'meeting_attachments');

-- Policy for authenticated users to upload to bucket
CREATE POLICY "Authenticated Upload meeting_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting_attachments');

-- Policy for users to delete their own uploads
CREATE POLICY "Users can delete own uploads meeting_attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'meeting_attachments' AND auth.uid() = owner);

-- 2. Create meeting_files table
CREATE TABLE IF NOT EXISTS public.meeting_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.meeting_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "View meeting_files" ON public.meeting_files;
    DROP POLICY IF EXISTS "Insert meeting_files" ON public.meeting_files;
    DROP POLICY IF EXISTS "Delete meeting_files" ON public.meeting_files;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Allow authenticated users to view meeting files (everyone can see meeting files if they can see the meeting)
-- For simplicity, since meetings are visible to organizers and participants, we allow authenticated users to view
CREATE POLICY "View meeting_files"
    ON public.meeting_files
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to insert meeting files
CREATE POLICY "Insert meeting_files"
    ON public.meeting_files
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow users to delete their own files or Founders to delete any
CREATE POLICY "Delete meeting_files"
    ON public.meeting_files
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'Founder'
        )
    );
