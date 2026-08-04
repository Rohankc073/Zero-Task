-- 1. Create task_attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('task_attachments', 'task_attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Policy for reading public bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'task_attachments');

-- Policy for authenticated users to upload to bucket
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task_attachments');

-- Policy for users to delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'task_attachments' AND auth.uid() = owner);

-- 2. Add file_name to task_files if it doesn't exist
ALTER TABLE IF EXISTS public.task_files 
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- 3. Create activity_comments table
CREATE TABLE IF NOT EXISTS public.activity_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "View activity_comments" ON public.activity_comments;
    DROP POLICY IF EXISTS "Insert activity_comments" ON public.activity_comments;
    DROP POLICY IF EXISTS "Users can delete own activity_comments or Founders can delete any" ON public.activity_comments;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 4. Apply RLS to activity_comments mirroring parent task
-- Select Policy
CREATE POLICY "View activity_comments"
    ON public.activity_comments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks
            WHERE tasks.id = activity_comments.task_id
        )
    );

-- Insert Policy
CREATE POLICY "Insert activity_comments"
    ON public.activity_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tasks
            WHERE tasks.id = activity_comments.task_id
        )
    );

-- Delete Policy
CREATE POLICY "Users can delete own activity_comments or Founders can delete any"
    ON public.activity_comments
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
