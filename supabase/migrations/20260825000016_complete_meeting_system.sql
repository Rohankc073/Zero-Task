-- Migration: 20260825000016_complete_meeting_system.sql
-- Complete Meeting System & Sequential Role-Based Approval Hierarchy

-- 1. Ensure columns on public.meetings
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Scheduled';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_platform TEXT DEFAULT 'Google Meet';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS agenda TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Create meeting_approvals table
CREATE TABLE IF NOT EXISTS public.meeting_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approver_role TEXT NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Waiting', 'Approved', 'Rejected'
    rejection_reason TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.meeting_approvals ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "meeting_approvals_select" ON public.meeting_approvals;
DROP POLICY IF EXISTS "meeting_approvals_insert" ON public.meeting_approvals;
DROP POLICY IF EXISTS "meeting_approvals_update" ON public.meeting_approvals;

-- Select policy
CREATE POLICY "meeting_approvals_select" ON public.meeting_approvals
FOR SELECT USING (
    auth.uid() = approver_id 
    OR auth.uid() = requester_id 
    OR public.get_auth_user_role() = 'Founder'
    OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = meeting_approvals.meeting_id AND mp.user_id = auth.uid())
);

-- Insert policy
CREATE POLICY "meeting_approvals_insert" ON public.meeting_approvals
FOR INSERT WITH CHECK (
    auth.uid() = requester_id OR public.get_auth_user_role() = 'Founder'
);

-- Update policy
CREATE POLICY "meeting_approvals_update" ON public.meeting_approvals
FOR UPDATE USING (
    auth.uid() = approver_id OR public.get_auth_user_role() = 'Founder'
);

-- 3. Stored Procedure to process sequential meeting approvals
CREATE OR REPLACE FUNCTION public.process_meeting_approval(
    p_approval_id UUID,
    p_action TEXT, -- 'Approved' or 'Rejected'
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_approval RECORD;
    v_meeting RECORD;
    v_requester RECORD;
    v_approver RECORD;
    v_next_approval RECORD;
    v_participant RECORD;
    v_actor_id UUID;
    v_actor_role TEXT;
BEGIN
    v_actor_id := auth.uid();
    SELECT * INTO v_approver FROM public.users WHERE id = v_actor_id;
    v_actor_role := v_approver.role;

    -- 1. Fetch approval record
    SELECT * INTO v_approval FROM public.meeting_approvals WHERE id = p_approval_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Approval record not found');
    END IF;

    -- 2. Validate permission
    IF v_approval.approver_id != v_actor_id AND v_actor_role != 'Founder' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Permission denied: you are not the assigned approver');
    END IF;

    IF v_approval.status != 'Pending' THEN
        RETURN jsonb_build_object('success', false, 'message', 'This approval request has already been processed');
    END IF;

    -- 3. Fetch meeting and requester
    SELECT * INTO v_meeting FROM public.meetings WHERE id = v_approval.meeting_id;
    SELECT * INTO v_requester FROM public.users WHERE id = v_approval.requester_id;

    -- 4. Process Rejection
    IF p_action = 'Rejected' THEN
        UPDATE public.meeting_approvals
        SET status = 'Rejected',
            rejection_reason = p_reason,
            responded_at = NOW(),
            updated_at = NOW()
        WHERE id = p_approval_id;

        -- Cancel all subsequent pending/waiting approvals for this meeting
        UPDATE public.meeting_approvals
        SET status = 'Rejected',
            updated_at = NOW()
        WHERE meeting_id = v_approval.meeting_id AND id != p_approval_id AND status IN ('Pending', 'Waiting');

        -- Update meeting status
        UPDATE public.meetings
        SET status = 'Rejected',
            rejection_reason = p_reason,
            updated_at = NOW()
        WHERE id = v_approval.meeting_id;

        -- Notify requester
        INSERT INTO public.notifications (user_id, title, body, type, metadata)
        VALUES (
            v_approval.requester_id,
            'Meeting Request Rejected',
            COALESCE(v_approver.full_name, 'Approver') || ' rejected meeting "' || v_meeting.title || '". Reason: ' || COALESCE(p_reason, 'No reason provided'),
            'meeting_rejected',
            jsonb_build_object('meeting_id', v_meeting.id, 'rejection_reason', p_reason)
        );

        RETURN jsonb_build_object('success', true, 'message', 'Meeting request rejected');
    END IF;

    -- 5. Process Approval
    IF p_action = 'Approved' THEN
        UPDATE public.meeting_approvals
        SET status = 'Approved',
            responded_at = NOW(),
            updated_at = NOW()
        WHERE id = p_approval_id;

        -- Check if there is a next approval in sequence
        SELECT * INTO v_next_approval 
        FROM public.meeting_approvals 
        WHERE meeting_id = v_approval.meeting_id 
          AND sequence_order > v_approval.sequence_order
          AND status = 'Waiting'
        ORDER BY sequence_order ASC
        LIMIT 1;

        IF FOUND THEN
            -- Activate next step
            UPDATE public.meeting_approvals
            SET status = 'Pending',
                updated_at = NOW()
            WHERE id = v_next_approval.id;

            -- Notify next approver
            IF v_next_approval.approver_id IS NOT NULL THEN
                INSERT INTO public.notifications (user_id, title, body, type, metadata)
                VALUES (
                    v_next_approval.approver_id,
                    'Meeting Approval Required',
                    'Meeting request "' || v_meeting.title || '" approved by ' || COALESCE(v_approver.full_name, 'prior approver') || '. Your approval is required.',
                    'meeting_approval_required',
                    jsonb_build_object('meeting_id', v_meeting.id, 'approval_id', v_next_approval.id)
                );
            END IF;

            RETURN jsonb_build_object('success', true, 'message', 'Approved and forwarded to next approver');
        ELSE
            -- Final approval complete! Confirm meeting!
            UPDATE public.meetings
            SET status = 'Scheduled',
                updated_at = NOW()
            WHERE id = v_approval.meeting_id;

            -- Notify requester
            INSERT INTO public.notifications (user_id, title, body, type, metadata)
            VALUES (
                v_approval.requester_id,
                'Meeting Scheduled & Confirmed',
                'Your meeting request "' || v_meeting.title || '" has been approved and confirmed.',
                'meeting_confirmed',
                jsonb_build_object('meeting_id', v_meeting.id)
            );

            -- Notify all participants
            FOR v_participant IN 
                SELECT user_id FROM public.meeting_participants WHERE meeting_id = v_approval.meeting_id AND user_id != v_approval.requester_id
            LOOP
                INSERT INTO public.notifications (user_id, title, body, type, metadata)
                VALUES (
                    v_participant.user_id,
                    'New Meeting Scheduled',
                    'You have been scheduled for meeting: "' || v_meeting.title || '" on ' || TO_CHAR(v_meeting.start_time, 'Mon DD, YYYY at HH12:MI AM'),
                    'meeting_invite',
                    jsonb_build_object('meeting_id', v_meeting.id)
                );
            END LOOP;

            RETURN jsonb_build_object('success', true, 'message', 'Meeting fully approved and confirmed');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Invalid approval action');
END;
$$;
