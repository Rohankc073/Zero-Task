-- Create task_files table for uploading attachments to tasks
CREATE TABLE IF NOT EXISTS public.task_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "View task_files" ON public.task_files;
    DROP POLICY IF EXISTS "Insert task_files" ON public.task_files;
    DROP POLICY IF EXISTS "Delete task_files" ON public.task_files;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Allow project members to view task files
CREATE POLICY "View task_files"
    ON public.task_files
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks
            WHERE tasks.id = task_files.task_id
        )
    );

-- Allow project members to insert task files
CREATE POLICY "Insert task_files"
    ON public.task_files
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tasks
            WHERE tasks.id = task_files.task_id
        )
    );

-- Allow users to delete their own files or Founders to delete any
CREATE POLICY "Delete task_files"
    ON public.task_files
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
