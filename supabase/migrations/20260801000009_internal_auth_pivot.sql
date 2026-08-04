-- Update the function to handle new auth users and create their public profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, onboarding_completed)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    -- Extract the role from user metadata, defaulting to Employee if not provided or invalid
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role_enum, 'Employee'::public.user_role_enum),
    true -- Automatically skip onboarding for new internal signups
  );
  RETURN NEW;
END;
$$;
