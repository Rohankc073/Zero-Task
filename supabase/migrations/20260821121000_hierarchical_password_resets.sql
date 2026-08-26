-- Migration: 20260821121000_hierarchical_password_resets.sql
-- Description: Modifies password_resets to support hierarchical approvals (Employee -> Manager -> Dept Head -> Founder)

-- 1. Rename employee_id to user_id safely if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'password_resets' 
      AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE public.password_resets RENAME COLUMN employee_id TO user_id;
  END IF;
END $$;

-- 2. Update RLS Policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "Employees can request resets" ON public.password_resets;
    DROP POLICY IF EXISTS "Managers can read requests" ON public.password_resets;
    DROP POLICY IF EXISTS "Users can request resets" ON public.password_resets;
    DROP POLICY IF EXISTS "Users can view own requests" ON public.password_resets;
    DROP POLICY IF EXISTS "Approvers can manage requests" ON public.password_resets;
EXCEPTION WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can request resets" 
ON public.password_resets FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own requests" 
ON public.password_resets FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Approvers can manage requests" 
ON public.password_resets FOR ALL 
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head', 'Manager'))
);

-- 3. Rewrite request_password_reset
CREATE OR REPLACE FUNCTION public.request_password_reset(p_email TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
    v_approver RECORD;
    v_message TEXT;
BEGIN
    SELECT id, role, department_id INTO v_user FROM public.users WHERE email = p_email;
    
    IF NOT FOUND THEN
        -- Prevent email enumeration
        RETURN json_build_object('direct', false, 'message', 'If account exists, your request has been sent to your supervisor.');
    END IF;

    IF v_user.role = 'Founder' THEN
        RETURN json_build_object('direct', true, 'message', 'Founders must reset passwords directly via the Supabase Dashboard.');
    END IF;

    -- Insert request
    INSERT INTO public.password_resets (user_id, status) VALUES (v_user.id, 'Pending');

    -- Determine approvers and create notifications
    IF v_user.role = 'Employee' THEN
        -- Notify Managers in same department
        FOR v_approver IN SELECT id FROM public.users WHERE role = 'Manager' AND department_id = v_user.department_id LOOP
            INSERT INTO public.in_app_notifications (user_id, title, message)
            VALUES (v_approver.id, 'Password Reset Request', 'Employee ' || p_email || ' requested a password reset.');
        END LOOP;
        v_message := 'Password reset requested. Please wait for your Manager to approve and provide your new password.';
    
    ELSIF v_user.role = 'Manager' THEN
        -- Notify Department Heads in same department
        FOR v_approver IN SELECT id FROM public.users WHERE role = 'Department Head' AND department_id = v_user.department_id LOOP
            INSERT INTO public.in_app_notifications (user_id, title, message)
            VALUES (v_approver.id, 'Password Reset Request', 'Manager ' || p_email || ' requested a password reset.');
        END LOOP;
        v_message := 'Password reset requested. Please wait for your Department Head to approve and provide your new password.';
    
    ELSIF v_user.role = 'Department Head' THEN
        -- Notify all Founders
        FOR v_approver IN SELECT id FROM public.users WHERE role = 'Founder' LOOP
            INSERT INTO public.in_app_notifications (user_id, title, message)
            VALUES (v_approver.id, 'Password Reset Request', 'Department Head ' || p_email || ' requested a password reset.');
        END LOOP;
        v_message := 'Password reset requested. Please wait for a Founder to approve and provide your new password.';
    END IF;

    RETURN json_build_object('direct', false, 'message', v_message);
END;
$$;

-- 4. Create hierarchical approval RPC
DROP FUNCTION IF EXISTS public.manager_reset_employee_password(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.approve_password_reset(p_request_id UUID, p_new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
    v_requester RECORD;
    v_approver RECORD;
    v_authorized BOOLEAN := false;
BEGIN
    -- Fetch caller (approver)
    SELECT id, role, department_id INTO v_approver FROM public.users WHERE id = auth.uid();

    -- Fetch the pending request
    SELECT * INTO v_req FROM public.password_resets WHERE id = p_request_id AND status = 'Pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Password reset request not found or already processed.';
    END IF;

    -- Fetch requester
    SELECT id, role, department_id INTO v_requester FROM public.users WHERE id = v_req.user_id;

    -- Validate Hierarchy
    IF v_requester.role = 'Employee' AND v_approver.role = 'Manager' AND v_approver.department_id = v_requester.department_id THEN
        v_authorized := true;
    ELSIF v_requester.role = 'Employee' AND v_approver.role = 'Department Head' AND v_approver.department_id = v_requester.department_id THEN
        v_authorized := true; -- Allow heads to bypass managers
    ELSIF v_requester.role = 'Manager' AND v_approver.role = 'Department Head' AND v_approver.department_id = v_requester.department_id THEN
        v_authorized := true;
    ELSIF v_requester.role = 'Department Head' AND v_approver.role = 'Founder' THEN
        v_authorized := true;
    ELSIF v_approver.role = 'Founder' THEN
        v_authorized := true; -- Founders can approve anything
    END IF;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Unauthorized. You do not have permission to reset this user''s password.';
    END IF;

    -- Update auth.users with new encrypted password
    UPDATE auth.users 
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = v_req.user_id;

    -- Mark request as approved
    UPDATE public.password_resets 
    SET status = 'Approved', updated_at = now()
    WHERE id = p_request_id;
END;
$$;
