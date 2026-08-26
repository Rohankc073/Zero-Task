-- Migration: 20260825000019_add_role_to_meeting_participants.sql
-- Add role column to public.meeting_participants and reload schema cache

ALTER TABLE IF EXISTS public.meeting_participants
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Participant';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
