-- Migration: 20260803000011_global_chat_rls.sql
-- Description: Unlocks chat channels and messages globally for all authenticated users.

DO $$ BEGIN
    DROP POLICY IF EXISTS "All users can view all channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "All users can read all messages" ON public.chat_messages;
    
    DROP POLICY IF EXISTS "Users can view authorized channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Founders can view all channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Management can view management and public channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Users can view their department channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Everyone can view public channels" ON public.chat_channels;
    
    DROP POLICY IF EXISTS "Users can read messages in accessible channels" ON public.chat_messages;
    DROP POLICY IF EXISTS "View messages in accessible channels" ON public.chat_messages;
    
    DROP POLICY IF EXISTS "Insert messages in accessible channels" ON public.chat_messages;
    DROP POLICY IF EXISTS "Users can insert messages in accessible channels" ON public.chat_messages;

    DROP POLICY IF EXISTS "Auth users can select chat_channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Auth users can insert chat_channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Auth users can select chat_messages" ON public.chat_messages;
    DROP POLICY IF EXISTS "Auth users can insert chat_messages" ON public.chat_messages;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Allow ANY authenticated user to SELECT from chat_channels
CREATE POLICY "Auth users can select chat_channels"
ON public.chat_channels FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow ANY authenticated user to INSERT to chat_channels (optional, if they need to create them)
CREATE POLICY "Auth users can insert chat_channels"
ON public.chat_channels FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow ANY authenticated user to SELECT from chat_messages
CREATE POLICY "Auth users can select chat_messages"
ON public.chat_messages FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow ANY authenticated user to INSERT to chat_messages
CREATE POLICY "Auth users can insert chat_messages"
ON public.chat_messages FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
