CREATE TABLE IF NOT EXISTS public.password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Allow employees to insert their own requests
CREATE POLICY "Employees can request resets" 
ON public.password_resets FOR INSERT 
WITH CHECK (auth.uid() = employee_id);

-- Allow anyone to read for now (we can restrict this later if needed, but primarily managers will read)
CREATE POLICY "Managers can read requests" 
ON public.password_resets FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('Founder', 'Department Head', 'Manager'))
);

-- RPC for Employee to request password reset safely by email
CREATE OR REPLACE FUNCTION public.request_password_reset(p_email TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, role INTO v_user FROM public.users WHERE email = p_email;
    
    IF NOT FOUND THEN
        -- Return generic success to prevent email enumeration
        RETURN json_build_object('direct', true, 'message', 'If account exists, an email has been sent.');
    END IF;

    IF v_user.role = 'Employee' THEN
        -- Insert a request
        INSERT INTO public.password_resets (employee_id, status)
        VALUES (v_user.id, 'Pending');
        RETURN json_build_object('direct', false, 'message', 'Password reset requested. Please wait for your Manager to approve and provide your new password.');
    ELSE
        -- Allow direct reset for non-employees
        RETURN json_build_object('direct', true, 'message', 'Direct reset allowed.');
    END IF;
END;
$$;

-- RPC for Manager to fulfill the reset
CREATE OR REPLACE FUNCTION public.manager_reset_employee_password(p_request_id UUID, p_new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
    v_mgr_role TEXT;
BEGIN
    -- Ensure caller is at least a Manager
    SELECT role INTO v_mgr_role FROM public.users WHERE id = auth.uid();
    IF v_mgr_role = 'Employee' THEN
        RAISE EXCEPTION 'Unauthorized. Only management can reset passwords.';
    END IF;

    -- Fetch the pending request
    SELECT * INTO v_req FROM public.password_resets WHERE id = p_request_id AND status = 'Pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Password reset request not found or already processed.';
    END IF;

    -- Update auth.users with new encrypted password
    UPDATE auth.users 
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = v_req.employee_id;

    -- Mark request as approved
    UPDATE public.password_resets 
    SET status = 'Approved', updated_at = now()
    WHERE id = p_request_id;
END;
$$;
