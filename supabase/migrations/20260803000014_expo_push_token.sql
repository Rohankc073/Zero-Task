-- Add expo_push_token to users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
