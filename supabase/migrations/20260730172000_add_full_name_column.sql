-- Add full_name column if it was skipped due to IF NOT EXISTS during table creation
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Also add name just in case they have old queries hitting name, though we use full_name now.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
