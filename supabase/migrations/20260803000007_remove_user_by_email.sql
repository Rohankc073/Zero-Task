-- Create a SECURITY DEFINER function to allow the Founder to remove a user by email
CREATE OR REPLACE FUNCTION public.remove_user_by_email(target_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  caller_role public.user_role_enum;
  target_user_id UUID;
BEGIN
  -- Get caller information
  SELECT role INTO caller_role
  FROM public.users WHERE id = auth.uid();

  -- Verify caller is Founder
  IF caller_role != 'Founder' THEN
    RAISE EXCEPTION 'Unauthorized: Only Founders can remove users';
  END IF;

  -- Find the user ID from the auth schema by email
  SELECT id INTO target_user_id
  FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with this email not found';
  END IF;

  -- Prevent self-deletion
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove your own account';
  END IF;

  -- Delete from auth.users (this cascades to public.users and other tables)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
