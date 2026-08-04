-- 1. Add is_approved flag to public.users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- 2. Update the trigger to explicitly set is_approved = false
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, onboarding_completed, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    -- Extract the role from user metadata, defaulting to Employee if not provided or invalid
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_enum, 'Employee'::public.user_role_enum),
    true, -- Automatically skip onboarding for new internal signups
    false -- Require explicit approval before allowing them into the app
  );
  RETURN NEW;
END;
$$;

-- 3. Update RLS policies so unapproved users can still read their own profile 
-- (This ensures the navigation guard can check their is_approved status)
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

-- Allow Founder to read all profiles (including unapproved)
DROP POLICY IF EXISTS "Founders can view all users" ON public.users;
CREATE POLICY "Founders can view all users"
ON public.users FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder')
);

-- Allow Department Heads to read Managers and Employees in their department
DROP POLICY IF EXISTS "Department Heads can view department members" ON public.users;
CREATE POLICY "Department Heads can view department members"
ON public.users FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Department Head' AND department_id = users.department_id)
);

-- Allow Managers to read Employees in their department
DROP POLICY IF EXISTS "Managers can view department employees" ON public.users;
CREATE POLICY "Managers can view department employees"
ON public.users FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Manager' AND department_id = users.department_id)
);

-- Allow Founders to update users (so they can approve them)
DROP POLICY IF EXISTS "Founders can update users" ON public.users;
CREATE POLICY "Founders can update users"
ON public.users FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Founder')
);

-- Allow Department Heads to update (approve) Managers/Employees in their dept
DROP POLICY IF EXISTS "Department Heads can update department members" ON public.users;
CREATE POLICY "Department Heads can update department members"
ON public.users FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Department Head' AND department_id = users.department_id)
);

-- Allow Managers to update (approve) Employees in their dept
DROP POLICY IF EXISTS "Managers can update department employees" ON public.users;
CREATE POLICY "Managers can update department employees"
ON public.users FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'Manager' AND department_id = users.department_id)
);
