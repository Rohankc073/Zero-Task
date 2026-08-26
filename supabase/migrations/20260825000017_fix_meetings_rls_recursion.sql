-- Migration: 20260825000017_fix_meetings_rls_recursion.sql
-- Fix mutual RLS recursion between meetings and meeting_participants

-- 1. Helper SECURITY DEFINER functions to bypass RLS during policy evaluation
CREATE OR REPLACE FUNCTION public.is_meeting_participant(p_meeting_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_organizer_or_founder(p_meeting_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings
    WHERE id = p_meeting_id AND (organizer_id = p_user_id OR public.get_auth_user_role() = 'Founder')
  );
$$;

-- 2. Drop existing policies on meetings and meeting_participants
DROP POLICY IF EXISTS "Users can view relevant meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings they organized" ON public.meetings;
DROP POLICY IF EXISTS "Users can view meetings they are part of" ON public.meetings;
DROP POLICY IF EXISTS "Users can insert meetings" ON public.meetings;
DROP POLICY IF EXISTS "Organizers and Founders can update meetings" ON public.meetings;
DROP POLICY IF EXISTS "Organizers and Founders can delete meetings" ON public.meetings;

DROP POLICY IF EXISTS "Users can view relevant meeting_participants" ON public.meeting_participants;
DROP POLICY IF EXISTS "Organizers and Founders can insert meeting_participants" ON public.meeting_participants;
DROP POLICY IF EXISTS "Organizers and Founders can delete meeting_participants" ON public.meeting_participants;

-- 3. Re-create non-recursive policies on public.meetings
CREATE POLICY "meetings_select_policy"
ON public.meetings FOR SELECT
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR public.is_meeting_participant(id, auth.uid())
);

CREATE POLICY "meetings_insert_policy"
ON public.meetings FOR INSERT
TO authenticated
WITH CHECK (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "meetings_update_policy"
ON public.meetings FOR UPDATE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "meetings_delete_policy"
ON public.meetings FOR DELETE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
);

-- 4. Re-create non-recursive policies on public.meeting_participants
CREATE POLICY "meeting_participants_select_policy"
ON public.meeting_participants FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR public.is_meeting_organizer_or_founder(meeting_id, auth.uid())
  OR public.is_meeting_participant(meeting_id, auth.uid())
);

CREATE POLICY "meeting_participants_insert_policy"
ON public.meeting_participants FOR INSERT
TO authenticated
WITH CHECK (
  public.get_auth_user_role() = 'Founder'
  OR public.is_meeting_organizer_or_founder(meeting_id, auth.uid())
  OR user_id = auth.uid()
);

CREATE POLICY "meeting_participants_delete_policy"
ON public.meeting_participants FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR public.is_meeting_organizer_or_founder(meeting_id, auth.uid())
);
