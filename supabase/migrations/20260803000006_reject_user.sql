-- Create a SECURITY DEFINER function to allow management to reject (delete) pending users
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
  target_approved BOOLEAN;
BEGIN
  -- Get caller information
  SELECT role, department_id INTO caller_role, caller_dept
  FROM public.users WHERE id = auth.uid();

  -- Get target information
  SELECT role, department_id, is_approved INTO target_role, target_dept, target_approved
  FROM public.users WHERE id = target_user_id;

  -- Ensure target actually exists
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Ensure the user is not already approved (safety check)
  IF target_approved = true THEN
    RAISE EXCEPTION 'Cannot reject an already approved user';
  END IF;

  -- Permission checks:
  -- Founder can reject anyone
  IF caller_role = 'Founder' THEN
    -- Allowed
  -- Department Head can reject Managers and Employees in their own department
  ELSIF caller_role = 'Department Head' AND target_dept = caller_dept AND target_role IN ('Manager', 'Employee') THEN
    -- Allowed
  -- Manager can reject Employees in their own department
  ELSIF caller_role = 'Manager' AND target_dept = caller_dept AND target_role = 'Employee' THEN
    -- Allowed
  ELSE
    RAISE EXCEPTION 'Unauthorized to reject this user';
  END IF;

  -- Delete from auth.users (cascades to public.users and in_app_notifications)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
