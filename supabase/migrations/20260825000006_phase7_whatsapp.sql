-- Phase 7: WhatsApp Integration

-- 1. Add phone_number to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE;

-- 2. Let users update their own phone number and preferences
DROP POLICY IF EXISTS "Users can update their phone number" ON public.users;
CREATE POLICY "Users can update their phone number"
ON public.users FOR UPDATE
USING (auth.uid() = id);
