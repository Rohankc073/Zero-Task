-- Migration: 20260830000000_task_voice_notes.sql
-- Adds task_voice_notes table for optional audio recordings attached to tasks.

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.task_voice_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  creator_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT 'Note',
  note_number     INT NOT NULL DEFAULT 1,
  duration_seconds NUMERIC(10,2) DEFAULT 0,
  mime_type       TEXT NOT NULL DEFAULT 'audio/m4a',
  file_size       BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Index for fast per-task queries
CREATE INDEX IF NOT EXISTS idx_task_voice_notes_task_id ON public.task_voice_notes(task_id);
CREATE INDEX IF NOT EXISTS idx_task_voice_notes_creator_id ON public.task_voice_notes(creator_id);

-- 3. Enable RLS
ALTER TABLE public.task_voice_notes ENABLE ROW LEVEL SECURITY;

-- 4. SELECT policy: any authenticated user who can see the task can see its voice notes
--    We rely on the tasks RLS. If the row exists in tasks for this user, they can read notes.
CREATE POLICY "Authorized users can view voice notes"
ON public.task_voice_notes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_id
  )
);

-- 5. INSERT policy: only the note creator can insert
CREATE POLICY "Creator can insert voice notes"
ON public.task_voice_notes FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
);

-- 6. DELETE policy: creator, Founder, or Super Admin
CREATE POLICY "Authorized users can delete voice notes"
ON public.task_voice_notes FOR DELETE
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.get_auth_user_role() IN ('Founder', 'Super Admin')
);

-- 7. Create the task-audio storage bucket (private, signed-URL access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-audio',
  'task-audio',
  false,
  20971520,  -- 20 MB per file
  ARRAY['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- 8. Storage RLS: authenticated users can upload to their own path
CREATE POLICY "Authenticated users can upload audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 9. Storage RLS: authenticated users can read audio (access validated at API level)
CREATE POLICY "Authenticated users can read audio"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-audio'
);

-- 10. Storage RLS: creator can delete their own audio files
CREATE POLICY "Creator can delete audio"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
