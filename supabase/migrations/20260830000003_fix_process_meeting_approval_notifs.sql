-- Migration: 20260830000003_fix_process_meeting_approval_notifs.sql
-- Description: Fix process_meeting_approval function to insert into public.in_app_notifications with metadata support

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
    v_actor_id UUID;
    v_actor_role TEXT;
BEGIN
    v_actor_id := auth.uid();
    SELECT * INTO v_approver FROM public.users WHERE id = v_actor_id;
    v_actor_role := COALESCE(v_approver.role, 'User');

    -- 1. Fetch approval record
    SELECT * INTO v_approval FROM public.meeting_approvals WHERE id = p_approval_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Approval record not found');
    END IF;

    -- 2. Validate permission
    IF v_approval.approver_id != v_actor_id AND v_actor_role != 'Founder' AND v_actor_role != 'Super Admin' THEN
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

        -- Notify requester via in_app_notifications
        INSERT INTO public.in_app_notifications (
            user_id, title, message, type, entity_type, entity_id, entity_title, actor_id, actor_name, actor_role, metadata
        ) VALUES (
            v_approval.requester_id,
            'Meeting Request Rejected',
            COALESCE(v_approver.full_name, 'Approver') || ' rejected meeting "' || v_meeting.title || '". Reason: ' || COALESCE(p_reason, 'No reason provided'),
            'MEETING',
            'MEETING',
            v_meeting.id,
            v_meeting.title,
            v_actor_id,
            COALESCE(v_approver.full_name, 'Approver'),
            v_actor_role,
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
                INSERT INTO public.in_app_notifications (
                    user_id, title, message, type, entity_type, entity_id, entity_title, actor_id, actor_name, actor_role, metadata
                ) VALUES (
                    v_next_approval.approver_id,
                    'Meeting Approval Required',
                    'Meeting request "' || v_meeting.title || '" approved by ' || COALESCE(v_approver.full_name, 'prior approver') || '. Your approval is required.',
                    'MEETING',
                    'MEETING',
                    v_meeting.id,
                    v_meeting.title,
                    v_actor_id,
                    COALESCE(v_approver.full_name, 'Approver'),
                    v_actor_role,
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
            INSERT INTO public.in_app_notifications (
                user_id, title, message, type, entity_type, entity_id, entity_title, actor_id, actor_name, actor_role, metadata
            ) VALUES (
                v_approval.requester_id,
                'Meeting Request Approved',
                'Your meeting request "' || v_meeting.title || '" has been fully approved and scheduled!',
                'MEETING',
                'MEETING',
                v_meeting.id,
                v_meeting.title,
                v_actor_id,
                COALESCE(v_approver.full_name, 'Approver'),
                v_actor_role,
                jsonb_build_object('meeting_id', v_meeting.id)
            );

            RETURN jsonb_build_object('success', true, 'message', 'Meeting request fully approved and scheduled');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Invalid action');
END;
$$;
