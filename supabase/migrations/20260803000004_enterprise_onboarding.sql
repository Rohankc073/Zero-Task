-- 1. Add organization_name to public.users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- 2. Update mock_checkout RPC to handle organization_name
CREATE OR REPLACE FUNCTION mock_checkout(org_name TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  ALTER TABLE public.users DISABLE TRIGGER enforce_subscription_update;
  
  UPDATE public.users 
  SET onboarding_completed = true, 
      subscription_status = 'active',
      organization_name = COALESCE(org_name, organization_name)
  WHERE id = auth.uid();
  
  ALTER TABLE public.users ENABLE TRIGGER enforce_subscription_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
