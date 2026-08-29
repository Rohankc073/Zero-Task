-- Migration: 20260830000002_fix_meeting_rls_approvers.sql
-- Description: Allow assigned approvers and department managers to view pending meeting requests in public.meetings and public.meeting_approvals

DROP POLICY IF EXISTS "meetings_select_policy" ON public.meetings;

CREATE POLICY "meetings_select_policy"
ON public.meetings FOR SELECT
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR (
    public.get_auth_user_role() = 'Super Admin'
    AND (
      is_private = false 
      OR is_private IS NULL 
      OR organizer_id = auth.uid()
      OR NOT (organizer_id IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
    )
  )
  OR public.is_meeting_participant(id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.meeting_approvals ma 
    WHERE ma.meeting_id = public.meetings.id AND ma.approver_id = auth.uid()
  )
  OR (
    public.get_auth_user_role() IN ('Manager', 'Department Head')
    AND (department_id = public.get_auth_user_department() OR department_id IS NULL)
  )
);

DROP POLICY IF EXISTS "meeting_approvals_select" ON public.meeting_approvals;

CREATE POLICY "meeting_approvals_select" ON public.meeting_approvals
FOR SELECT USING (
    approver_id = auth.uid() 
    OR requester_id = auth.uid() 
    OR public.get_auth_user_role() IN ('Founder', 'Super Admin')
    OR (
      public.get_auth_user_role() IN ('Manager', 'Department Head')
      AND EXISTS (
        SELECT 1 FROM public.users u 
        WHERE u.id = requester_id AND (u.department_id = public.get_auth_user_department() OR u.department_id IS NULL)
      )
    )
    OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = meeting_approvals.meeting_id AND mp.user_id = auth.uid())
);
