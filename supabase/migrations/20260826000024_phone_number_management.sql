-- Migration: 20260826000024_phone_number_management.sql
-- Description: Phone number management, hierarchical approvals for phone changes, and whatsapp readiness.

--------------------------------------------------------------------------------
-- 1. Modify handle_new_user to extract phone_number
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, department_id, onboarding_completed, is_approved, status, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_enum, 'Employee'::public.user_role_enum),
    NULLIF(NEW.raw_user_meta_data->>'department_id', '')::uuid,
    true,
    false,
    'Pending'::user_status_enum,
    NEW.raw_user_meta_data->>'phone_number'
  );
  RETURN NEW;
END;
$$;


--------------------------------------------------------------------------------
-- 2. Create phone_change_requests Table
--------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE phone_change_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.phone_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    new_phone_number TEXT NOT NULL,
    status phone_change_status DEFAULT 'Pending',
    approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Index for querying pending requests
CREATE INDEX IF NOT EXISTS idx_phone_requests_status ON public.phone_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_phone_requests_approver ON public.phone_change_requests(approver_id);
CREATE INDEX IF NOT EXISTS idx_phone_requests_user ON public.phone_change_requests(user_id);


--------------------------------------------------------------------------------
-- 3. RLS for phone_change_requests
--------------------------------------------------------------------------------
ALTER TABLE public.phone_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can select their own requests
CREATE POLICY "Users can view own phone requests"
ON public.phone_change_requests FOR SELECT
USING (auth.uid() = user_id);

-- Approvers (Founders/Heads/Managers) can view requests assigned to them, Founders can view all
CREATE POLICY "Approvers can view assigned phone requests"
ON public.phone_change_requests FOR SELECT
USING (
  auth.uid() = approver_id OR 
  public.get_auth_user_role() = 'Founder'
);


--------------------------------------------------------------------------------
-- 4. RPCs for Requesting and Approving Phone Number Changes
--------------------------------------------------------------------------------

-- RPC to request a phone number change
CREATE OR REPLACE FUNCTION public.request_phone_change(p_new_phone TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role_enum;
    v_dept_id UUID;
    v_approver_id UUID;
    v_request_id UUID;
    v_pending_count INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if a pending request already exists
    SELECT count(*) INTO v_pending_count FROM public.phone_change_requests WHERE user_id = v_user_id AND status = 'Pending';
    IF v_pending_count > 0 THEN
        RAISE EXCEPTION 'You already have a pending phone change request.';
    END IF;

    SELECT role, department_id INTO v_role, v_dept_id FROM public.users WHERE id = v_user_id;

    -- Determine approver
    IF v_role = 'Employee' THEN
        -- Find Manager of same department
        SELECT id INTO v_approver_id FROM public.users WHERE role = 'Manager' AND department_id = v_dept_id LIMIT 1;
        -- Fallback to Dept Head
        IF v_approver_id IS NULL THEN
            SELECT id INTO v_approver_id FROM public.users WHERE role = 'Department Head' AND department_id = v_dept_id LIMIT 1;
        END IF;
    ELSIF v_role = 'Manager' THEN
        -- Find Dept Head of same department
        SELECT id INTO v_approver_id FROM public.users WHERE role = 'Department Head' AND department_id = v_dept_id LIMIT 1;
    ELSIF v_role = 'Department Head' THEN
        -- Find Founder
        SELECT id INTO v_approver_id FROM public.users WHERE role = 'Founder' LIMIT 1;
    END IF;

    -- If no approver found (or it's the founder themselves), just find any Founder
    IF v_approver_id IS NULL THEN
        SELECT id INTO v_approver_id FROM public.users WHERE role = 'Founder' AND id != v_user_id LIMIT 1;
    END IF;

    IF v_role = 'Founder' THEN
        -- Founders auto-approve their own changes
        UPDATE public.users SET phone_number = p_new_phone WHERE id = v_user_id;
        RETURN NULL;
    END IF;

    -- Insert the request
    INSERT INTO public.phone_change_requests (user_id, new_phone_number, status, approver_id)
    VALUES (v_user_id, p_new_phone, 'Pending', v_approver_id)
    RETURNING id INTO v_request_id;

    -- Notify the approver
    IF v_approver_id IS NOT NULL THEN
        INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
        VALUES (
            v_approver_id,
            'Phone Change Request',
            (SELECT full_name FROM public.users WHERE id = v_user_id) || ' requested to change their phone number to ' || p_new_phone,
            'action',
            '/approvals'
        );
    END IF;

    RETURN v_request_id;
END;
$$;


-- RPC to process the approval
CREATE OR REPLACE FUNCTION public.process_phone_change_approval(p_request_id UUID, p_action phone_change_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_approver_id UUID := auth.uid();
    v_caller_role public.user_role_enum;
    v_req RECORD;
BEGIN
    IF v_approver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_action = 'Pending' THEN
        RAISE EXCEPTION 'Action must be Approved or Rejected';
    END IF;

    SELECT * INTO v_req FROM public.phone_change_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_req.status != 'Pending' THEN
        RAISE EXCEPTION 'Request is already processed';
    END IF;

    SELECT role INTO v_caller_role FROM public.users WHERE id = v_approver_id;

    -- Security Check: Caller must be the assigned approver, or a Founder
    IF v_req.approver_id != v_approver_id AND v_caller_role != 'Founder' THEN
        RAISE EXCEPTION 'Unauthorized to process this request';
    END IF;

    -- Update the request
    UPDATE public.phone_change_requests
    SET status = p_action,
        resolved_at = now(),
        resolved_by = v_approver_id
    WHERE id = p_request_id;

    -- If approved, update the user's phone number
    IF p_action = 'Approved' THEN
        UPDATE public.users SET phone_number = v_req.new_phone_number WHERE id = v_req.user_id;
    END IF;

    -- Notify the requester
    INSERT INTO public.in_app_notifications (user_id, title, message, type)
    VALUES (
        v_req.user_id,
        'Phone Change ' || p_action,
        'Your request to change your phone number to ' || v_req.new_phone_number || ' was ' || lower(p_action::text) || '.',
        'system'
    );
END;
$$;
