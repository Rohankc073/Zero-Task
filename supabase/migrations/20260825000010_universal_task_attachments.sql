-- Migration: 20260825000010_universal_task_attachments.sql
-- Description: Adds file_size, mime_type, storage_path to task_files and updates RLS policies.

BEGIN;

-- 1. Extend task_files table metadata
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.task_files ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- 2. Update RLS policies on public.task_files
ALTER TABLE public.task_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View task_files" ON public.task_files;
DROP POLICY IF EXISTS "Insert task_files" ON public.task_files;
DROP POLICY IF EXISTS "Delete task_files" ON public.task_files;

-- Allow users who can access the task to view its files
CREATE POLICY "View task_files"
ON public.task_files FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = task_files.task_id
    )
);

-- Allow users who can access the task to attach files
CREATE POLICY "Insert task_files"
ON public.task_files FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = task_files.task_id
    )
);

-- Allow the uploader, Founder, task creator, or department managers to delete task files
CREATE POLICY "Delete task_files"
ON public.task_files FOR DELETE
TO authenticated
USING (
    user_id = auth.uid()
    OR get_auth_user_role() = 'Founder'
    OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_files.task_id
        AND (
            t.created_by = auth.uid()
            OR (
                get_auth_user_role() IN ('Department Head', 'Manager')
                AND t.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
            )
        )
    )
);

-- 3. Ensure storage policies for task_attachments bucket allow authenticated deletions
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authorized task file deletion" ON storage.objects;

CREATE POLICY "Authorized task file deletion"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'task_attachments');

COMMIT;
