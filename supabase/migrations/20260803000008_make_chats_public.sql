-- 20260803000008_make_chats_public.sql
-- Relax RLS policies for chat_channels and chat_messages to make them visible to all authenticated users.

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view authorized channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Founders can view all channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Management can view management and public channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Users can view their department channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Everyone can view public channels" ON public.chat_channels;
    
    DROP POLICY IF EXISTS "Users can read messages in accessible channels" ON public.chat_messages;
    DROP POLICY IF EXISTS "View messages in accessible channels" ON public.chat_messages;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Allow any authenticated user to view ALL channels
CREATE POLICY "All users can view all channels" ON public.chat_channels
    FOR SELECT USING (true);

-- Allow any authenticated user to view ALL messages
CREATE POLICY "All users can read all messages" ON public.chat_messages
    FOR SELECT USING (true);
