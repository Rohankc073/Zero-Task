-- Migration: 20260827000001_phone_approval_param_alias.sql
-- Description: Ensure process_phone_change_approval supports p_action and p_decision interchangeably.

CREATE OR REPLACE FUNCTION public.process_phone_change_approval(
    p_request_id UUID,
    p_action TEXT DEFAULT 'Approved',
    p_decision TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_approver_id UUID := auth.uid();
    v_approver_role public.user_role_enum;
    v_approver_name TEXT;
    v_final_decision TEXT;
BEGIN
    IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_final_decision := COALESCE(p_decision, p_action);

    SELECT role, full_name INTO v_approver_role, v_approver_name FROM public.users WHERE id = v_approver_id;

    -- Fetch request
    SELECT * INTO v_req FROM public.phone_change_requests WHERE id = p_request_id FOR UPDATE;
    IF v_req IS NULL THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_req.status != 'Pending' THEN
        RAISE EXCEPTION 'Request has already been processed.';
    END IF;

    -- Permission check: must be assigned approver or Founder
    IF v_req.approver_id != v_approver_id AND v_approver_role != 'Founder' THEN
        RAISE EXCEPTION 'You do not have permission to approve this request.';
    END IF;

    IF v_final_decision = 'Approved' THEN
        -- 1. Update user profile phone number
        UPDATE public.users
        SET phone_number = v_req.new_phone_number
        WHERE id = v_req.user_id;

        -- 2. Update request status
        UPDATE public.phone_change_requests
        SET status = 'Approved', resolved_at = now(), resolved_by = v_approver_id
        WHERE id = p_request_id;

        -- 3. Notify requester
        INSERT INTO public.in_app_notifications (
          user_id, entity_type, entity_id, entity_state, title, message, type, is_read, created_at, updated_at
        ) VALUES (
          v_req.user_id,
          'PHONE_CHANGE',
          p_request_id,
          'APPROVED',
          'Phone Number Updated',
          'Your phone number has been updated to ' || v_req.new_phone_number || ' by ' || COALESCE(v_approver_name, 'your supervisor') || '.',
          'PHONE_APPROVED',
          false,
          now(),
          now()
        );

        -- 4. Audit log
        INSERT INTO public.audit_logs (user_id, action_type, description)
        VALUES (
            v_approver_id,
            'USER_APPROVED',
            'Approved phone number change for user ' || v_req.user_id || ' to ' || v_req.new_phone_number
        );
    ELSIF v_final_decision = 'Rejected' THEN
        UPDATE public.phone_change_requests
        SET status = 'Rejected', resolved_at = now(), resolved_by = v_approver_id
        WHERE id = p_request_id;

        -- Notify requester
        INSERT INTO public.in_app_notifications (
          user_id, entity_type, entity_id, entity_state, title, message, type, is_read, created_at, updated_at
        ) VALUES (
          v_req.user_id,
          'PHONE_CHANGE',
          p_request_id,
          'REJECTED',
          'Phone Change Request Rejected',
          'Your request to change phone number to ' || v_req.new_phone_number || ' was rejected by ' || COALESCE(v_approver_name, 'your supervisor') || '.',
          'PHONE_REJECTED',
          false,
          now(),
          now()
        );
    ELSE
        RAISE EXCEPTION 'Invalid decision. Must be Approved or Rejected.';
    END IF;

    RETURN TRUE;
END;
$$;
