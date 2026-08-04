-- 1. Helper function for department to break recursion
CREATE OR REPLACE FUNCTION public.get_auth_user_department()
RETURNS UUID AS $$
DECLARE
  user_dept UUID;
BEGIN
  SELECT department_id INTO user_dept FROM public.users WHERE id = auth.uid();
  RETURN user_dept;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the recursive policies on public.users
DROP POLICY IF EXISTS "Founders can view all users" ON public.users;
DROP POLICY IF EXISTS "Department Heads can view department members" ON public.users;
DROP POLICY IF EXISTS "Managers can view department employees" ON public.users;
DROP POLICY IF EXISTS "Founders can update users" ON public.users;
DROP POLICY IF EXISTS "Department Heads can update department members" ON public.users;
DROP POLICY IF EXISTS "Managers can update department employees" ON public.users;

-- 3. Create non-recursive policies

-- View Policies
CREATE POLICY "Founders can view all users"
ON public.users FOR SELECT
USING (
  public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "Department Heads can view department members"
ON public.users FOR SELECT
USING (
  public.get_auth_user_role() = 'Department Head' AND department_id = public.get_auth_user_department()
);

CREATE POLICY "Managers can view department employees"
ON public.users FOR SELECT
USING (
  public.get_auth_user_role() = 'Manager' AND department_id = public.get_auth_user_department()
);


-- Update Policies
CREATE POLICY "Founders can update users"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "Department Heads can update department members"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Department Head' AND department_id = public.get_auth_user_department()
);

CREATE POLICY "Managers can update department employees"
ON public.users FOR UPDATE
USING (
  public.get_auth_user_role() = 'Manager' AND department_id = public.get_auth_user_department()
);
