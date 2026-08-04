DO $$ BEGIN
    CREATE TYPE audit_action_type AS ENUM ('TASK_UPDATE', 'MILESTONE_UPDATE', 'USER_APPROVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    action_type audit_action_type NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs RLS policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
    DROP POLICY IF EXISTS "Founders can view audit logs" ON audit_logs;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- ANY authenticated user can INSERT
CREATE POLICY "Authenticated users can insert audit logs"
    ON audit_logs
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ONLY Founders can SELECT (Read-only)
CREATE POLICY "Founders can view audit logs"
    ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Founder'
        )
    );

-- 3. Add avatar_url to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 4. Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (already enabled by default in Supabase)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage Policies for avatars
DO $$ BEGIN
    DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
    DROP POLICY IF EXISTS "Users can upload their own avatar." ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatar." ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatar." ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Avatar images are publicly accessible."
    ON storage.objects FOR SELECT
    USING ( bucket_id = 'avatars' );

CREATE POLICY "Users can upload their own avatar."
    ON storage.objects FOR INSERT
    WITH CHECK ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );

CREATE POLICY "Users can update their own avatar."
    ON storage.objects FOR UPDATE
    USING ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );

CREATE POLICY "Users can delete their own avatar."
    ON storage.objects FOR DELETE
    USING ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );
