-- 6. Add pre-registration check RPC for frontend
CREATE OR REPLACE FUNCTION public.check_role_availability(p_role text, p_department_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  role_count int;
BEGIN
  -- We only restrict Department Head and Manager
  IF p_role IN ('Department Head', 'Manager') AND p_department_id IS NOT NULL THEN
    SELECT COUNT(*) INTO role_count
    FROM public.users
    WHERE role = p_role::public.user_role_enum AND department_id = p_department_id;
    
    IF role_count > 0 THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;
