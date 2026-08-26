-- Migration: 20260819000003_onboarding_workflow.sql

-- Description: Department-scoped onboarding, strict approval workflows, and unique approver enforcement.

--------------------------------------------------------------------------------
-- 1. Add Status Column to public.users & Unique Approver Indexes
--------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_status_enum AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status user_status_enum DEFAULT 'Pending';

-- Backfill status based on is_approved
UPDATE public.users SET status = 'Approved' WHERE is_approved = true;
UPDATE public.users SET status = 'Pending' WHERE is_approved = false AND status != 'Rejected';

-- Enforce strictly 1 Manager and 1 Department Head per department
CREATE UNIQUE INDEX IF NOT EXISTS unique_department_manager ON public.users (department_id) WHERE role = 'Manager' AND department_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_department_head ON public.users (department_id) WHERE role = 'Department Head' AND department_id IS NOT NULL;


--------------------------------------------------------------------------------
-- 2. Modify handle_new_user to use status
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, department_id, onboarding_completed, is_approved, status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_enum, 'Employee'::public.user_role_enum),
    NULLIF(NEW.raw_user_meta_data->>'department_id', '')::uuid,
    true,
    false,
    'Pending'::user_status_enum
  );
  RETURN NEW;
END;
$$;


--------------------------------------------------------------------------------
-- 3. Modify reject_user RPC for safe rejections
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_role public.user_role_enum;
  target_role public.user_role_enum;
  caller_dept UUID;
  target_dept UUID;
  target_status user_status_enum;
BEGIN
  -- Get caller information
  SELECT role, department_id INTO caller_role, caller_dept
  FROM public.users WHERE id = auth.uid();

  -- Get target information
  SELECT role, department_id, status INTO target_role, target_dept, target_status
  FROM public.users WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF target_status = 'Approved' THEN
    RAISE EXCEPTION 'Cannot reject an already approved user';
  END IF;

  -- Strict Department Scope Check for Rejection:
  IF caller_role = 'Founder' AND target_role = 'Department Head' THEN
    -- Allowed
  ELSIF caller_role = 'Department Head' AND target_role = 'Manager' AND target_dept IS NOT DISTINCT FROM caller_dept THEN
    -- Allowed
  ELSIF caller_role = 'Manager' AND target_role = 'Employee' AND target_dept IS NOT DISTINCT FROM caller_dept THEN
    -- Allowed
  ELSE
    RAISE EXCEPTION 'Unauthorized to reject this user';
  END IF;

  -- Update status instead of deleting from auth.users
  UPDATE public.users 
  SET status = 'Rejected', is_approved = false
  WHERE id = target_user_id;
END;
$$;


--------------------------------------------------------------------------------
-- 4. Centralize Actionable & Informational Notifications
--------------------------------------------------------------------------------
-- Drop existing conflicting triggers
DROP TRIGGER IF EXISTS tr_route_registration_alert ON public.registration_requests;
DROP TRIGGER IF EXISTS tr_new_user_registration_notification ON public.users;
DROP TRIGGER IF EXISTS on_new_user_alert ON public.users;
DROP TRIGGER IF EXISTS trg_general_onboarding_notification ON public.users;

CREATE OR REPLACE FUNCTION public.trigger_department_scoped_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only trigger when a new user registers (Pending state)
    IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
        
        -- 4A: ACTIONABLE APPROVAL NOTIFICATION
        -- Strictly routed to the exact designated approver
        IF NEW.role = 'Department Head' THEN
            INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
            SELECT id, 'Action Required: New Department Head', NEW.full_name || ' (' || NEW.email || ') requested Department Head access.', 'action', '/approvals'
            FROM public.users WHERE role = 'Founder';
            
        ELSIF NEW.role = 'Manager' THEN
            INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
            SELECT id, 'Action Required: New Manager', NEW.full_name || ' (' || NEW.email || ') requested Manager access for your department.', 'action', '/approvals'
            FROM public.users WHERE role = 'Department Head' AND department_id = NEW.department_id;
            
        ELSIF NEW.role = 'Employee' THEN
            INSERT INTO public.in_app_notifications (user_id, title, message, type, action_url)
            SELECT id, 'Action Required: New Employee', NEW.full_name || ' (' || NEW.email || ') requested Employee access for your department.', 'action', '/approvals'
            FROM public.users WHERE role = 'Manager' AND department_id = NEW.department_id;
        END IF;

        -- 4B: INFORMATIONAL NOTIFICATION (Optional)
        -- Founder gets notified about everything (informational).
        IF NEW.role != 'Department Head' THEN
            INSERT INTO public.in_app_notifications (user_id, title, message, type)
            SELECT id, 'Informational: New ' || NEW.role, NEW.full_name || ' registered in department.', 'system'
            FROM public.users WHERE role = 'Founder';
        END IF;

    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_department_scoped_onboarding ON public.users;
CREATE TRIGGER trg_department_scoped_onboarding
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_department_scoped_onboarding();


--------------------------------------------------------------------------------
-- 5. Strict Update Policies (Approval Authorization)
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Founders can update users" ON public.users;
DROP POLICY IF EXISTS "Department Heads can update permitted members" ON public.users;
DROP POLICY IF EXISTS "Managers can update permitted members" ON public.users;
DROP POLICY IF EXISTS "Department Heads can update department members" ON public.users;
DROP POLICY IF EXISTS "Managers can update department employees" ON public.users;

-- Founders can update (approve/reject) Department Heads
CREATE POLICY "Founders can update users"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Founder'
);

-- Dept Heads can update (approve/reject) Managers in their department
CREATE POLICY "Department Heads can update permitted members"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Department Head' 
  AND role = 'Manager'
  AND department_id IS NOT DISTINCT FROM public.get_auth_user_department()
);

-- Managers can update (approve/reject) Employees in their department
CREATE POLICY "Managers can update permitted members"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Manager' 
  AND role = 'Employee'
  AND department_id IS NOT DISTINCT FROM public.get_auth_user_department()
);
