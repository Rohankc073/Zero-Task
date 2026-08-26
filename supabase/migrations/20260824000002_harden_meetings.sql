-- Migration: 20260824000002_harden_meetings.sql
-- Description: Hardens meeting creation to explicitly block the Employee role.

BEGIN;

-- Drop the previous loose insert policy
DROP POLICY IF EXISTS "Users can insert meetings" ON public.meetings;

-- Create the restricted insert policy
CREATE POLICY "Users can insert meetings"
ON public.meetings FOR INSERT
WITH CHECK (
  organizer_id = auth.uid() 
  AND public.get_auth_user_role() != 'Employee'
);

COMMIT;
