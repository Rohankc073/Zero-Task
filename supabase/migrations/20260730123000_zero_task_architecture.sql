-- Migration: 20260730132000_zero_task_architecture.sql
-- Description: Core database architecture for ZeroTask registration workflow, roles, and webhooks.

-------------------------------------------------------------------------------
-- 1. User Roles & Table Extensions
-------------------------------------------------------------------------------
-- Create ENUM for roles
DO $$ BEGIN
    CREATE TYPE public.user_role_enum AS ENUM ('Founder', 'Department Head', 'Manager', 'Employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create public.users table mirroring auth.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role public.user_role_enum DEFAULT 'Employee'::public.user_role_enum
);

-- Function to handle new auth users and create their public profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'Employee'::public.user_role_enum
  );
  RETURN NEW;
END;
$$;

-- Trigger to automatically call the handle_new_user function when an auth.user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-------------------------------------------------------------------------------
-- 2. Registration Requests Schema
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    requested_role public.user_role_enum NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-------------------------------------------------------------------------------
-- 3. The 24-Hour Lockout PL/pgSQL Function
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_registration_request(p_email TEXT, p_role public.user_role_enum)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Allows execution bypassing RLS restrictions for anonymous submitters
AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT * INTO v_req FROM public.registration_requests WHERE email = p_email;

    IF FOUND THEN
        IF v_req.status = 'Rejected' THEN
            IF (now() - v_req.rejected_at) < interval '24 hours' THEN
                RAISE EXCEPTION 'Email locked out due to recent rejection.';
            ELSE
                UPDATE public.registration_requests
                SET status = 'Pending',
                    requested_role = p_role,
                    rejected_at = NULL,
                    updated_at = now()
                WHERE email = p_email;
            END IF;
        ELSIF v_req.status = 'Pending' THEN
            RAISE EXCEPTION 'Request already pending.';
        ELSIF v_req.status = 'Approved' THEN
            RAISE EXCEPTION 'Account already approved.';
        END IF;
    ELSE
        INSERT INTO public.registration_requests (email, requested_role, status)
        VALUES (p_email, p_role, 'Pending');
    END IF;
END;
$$;


-------------------------------------------------------------------------------
-- 4. Strict Row Level Security (RLS) Policies
-------------------------------------------------------------------------------
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anonymous users do not need direct INSERT/UPDATE policies because 
-- submit_registration_request operates with SECURITY DEFINER privileges.

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Founder can select all requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Founder can update all requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Department Head select requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Department Head update requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Manager select requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Manager update requests" ON public.registration_requests;

-- Founder Policy: ALL access (SELECT, UPDATE)
CREATE POLICY "Founder can select all requests" ON public.registration_requests FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder')
);
CREATE POLICY "Founder can update all requests" ON public.registration_requests FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder')
);

-- Department Head Policy: Manager or Employee only
CREATE POLICY "Department Head select requests" ON public.registration_requests FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Department Head')
    AND requested_role IN ('Manager', 'Employee')
);
CREATE POLICY "Department Head update requests" ON public.registration_requests FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Department Head')
    AND requested_role IN ('Manager', 'Employee')
);

-- Manager Policy: Employee only
CREATE POLICY "Manager select requests" ON public.registration_requests FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Manager')
    AND requested_role = 'Employee'
);
CREATE POLICY "Manager update requests" ON public.registration_requests FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Manager')
    AND requested_role = 'Employee'
);
-- Employee users receive an implicit deny because no policy grants them access.


-------------------------------------------------------------------------------
-- 6. Management Notification Webhook (Integration Preparation)
-------------------------------------------------------------------------------
-- Ensure pg_net extension is enabled to make HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_management_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payload JSON;
BEGIN
    -- Fire only when a row is inserted as Pending, or updated to Pending
    IF (TG_OP = 'INSERT' AND NEW.status = 'Pending') OR 
       (TG_OP = 'UPDATE' AND NEW.status = 'Pending' AND OLD.status != 'Pending') THEN
        
        payload := json_build_object(
            'email', NEW.email,
            'requested_role', NEW.requested_role,
            'created_at', NEW.created_at
        );
        
        -- Make the POST request to the external automation tool / webhook URL
        -- Ensure you replace the placeholder URL with your actual endpoint
        PERFORM net.http_post(
            url := 'https://your-webhook-url.com/notify',
            body := payload::jsonb
        );
        
    END IF;
    RETURN NEW;
END;
$$;

-- Bind the trigger to the registration_requests table
DROP TRIGGER IF EXISTS trigger_notify_management ON public.registration_requests;
CREATE TRIGGER trigger_notify_management
    AFTER INSERT OR UPDATE ON public.registration_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_management_webhook();


-------------------------------------------------------------------------------
-- 5. Initial Founder Seeding Script (Manual Execution Block)
-------------------------------------------------------------------------------
/*
-- ============================================================================
-- MANUAL SEEDING SCRIPT
-- ============================================================================
-- Instructions: Execute the following block manually in the Supabase SQL Editor 
-- to bypass the approval flow and elevate your initial account to 'Founder'.
-- 
-- 1. Sign up normally via the app or Supabase Authentication Dashboard.
--    This creates the auth.users record, firing the trigger to populate public.users.
-- 2. Run the UPDATE statement below.

UPDATE public.users 
SET role = 'Founder'::public.user_role_enum
WHERE email = 'founder@yourdomain.com'; -- IMPORTANT: Replace with your actual email

-- Optional snippet if you need to create the user purely via SQL (not recommended for production):
-- INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) 
-- VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'founder@yourdomain.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Initial Founder"}', now(), now());
-- (After insertion, run the UPDATE above).
-- ============================================================================
*/
