-- 1. Add attachment columns to chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- 2. Make content column nullable (so users can send an attachment without text)
ALTER TABLE public.chat_messages
ALTER COLUMN content DROP NOT NULL;

-- 3. Create the 'chat-attachments' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS on storage.objects for chat-attachments
-- Storage RLS is already enabled by default, but we need to add policies for this bucket

-- Drop existing policies if any to avoid errors on retry
DO $$ BEGIN
    DROP POLICY IF EXISTS "Authenticated users can select chat attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can insert chat attachments" ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Allow authenticated users to view all files in 'chat-attachments'
CREATE POLICY "Authenticated users can select chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments' AND
  auth.role() = 'authenticated'
);

-- Allow authenticated users to upload files to 'chat-attachments'
CREATE POLICY "Authenticated users can insert chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments' AND
  auth.role() = 'authenticated'
);
