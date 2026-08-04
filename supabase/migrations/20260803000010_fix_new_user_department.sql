-- Migration: 20260803000010_fix_new_user_department.sql
-- Description: Updates the handle_new_user trigger function to correctly insert the department_id when a new user signs up.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, department_id, onboarding_completed, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    -- Extract the role from user metadata, defaulting to Employee if not provided or invalid
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_enum, 'Employee'::public.user_role_enum),
    -- Correctly cast the department_id to UUID, or NULL if not provided
    NULLIF(NEW.raw_user_meta_data->>'department_id', '')::uuid,
    true, -- Automatically skip onboarding for new internal signups
    false -- Require explicit approval before allowing them into the app
  );
  RETURN NEW;
END;
$$;
