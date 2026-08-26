-- Migration: 20260820000000_department_scoped_chat.sql
-- Description: Department-scoped chat isolation architecture

-- 1. Create channels for existing departments
INSERT INTO public.chat_channels (name, type, department_id)
SELECT name, 'public', id
FROM public.departments
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_channels WHERE department_id = departments.id
);

-- 2. Trigger for creating channels when new departments are added
CREATE OR REPLACE FUNCTION public.create_department_channel()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_channels (name, type, department_id)
  VALUES (NEW.name, 'public', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_department_channel ON public.departments;
CREATE TRIGGER trg_create_department_channel
AFTER INSERT ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.create_department_channel();

-- 3. Drop all globally open policies
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

-- 4. Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. New RLS Policies for chat_channels
CREATE POLICY "Users can view authorized channels"
ON public.chat_channels FOR SELECT
USING (
  department_id IS NULL OR 
  department_id = public.get_auth_user_department() OR 
  public.get_auth_user_role() = 'Founder'
);

-- Only postgres/service_role can insert channels, users shouldn't create arbitrary channels
-- No INSERT policy for authenticated users means they can't insert.

-- 6. New RLS Policies for chat_messages
CREATE POLICY "Users can read messages in accessible channels"
ON public.chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_channels 
    WHERE id = chat_messages.channel_id AND (
      department_id IS NULL OR 
      department_id = public.get_auth_user_department() OR 
      public.get_auth_user_role() = 'Founder'
    )
  )
);

CREATE POLICY "Users can insert messages in accessible channels"
ON public.chat_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_channels 
    WHERE id = chat_messages.channel_id AND (
      department_id IS NULL OR 
      department_id = public.get_auth_user_department() OR 
      public.get_auth_user_role() = 'Founder'
    )
  )
);
