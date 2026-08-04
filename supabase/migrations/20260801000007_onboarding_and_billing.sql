-- 1. Create subscription_status ENUM
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to public.users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status subscription_status;

-- 3. Trigger to enforce read-only subscription_status for clients
CREATE OR REPLACE FUNCTION check_subscription_update() RETURNS trigger AS $$
BEGIN
  -- If this is an authenticated user (client) and they are trying to change the subscription_status
  IF auth.uid() IS NOT NULL AND NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Only service_role can update subscription_status directly';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_subscription_update ON public.users;
CREATE TRIGGER enforce_subscription_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION check_subscription_update();

-- 4. Mock Checkout RPC (runs with SECURITY DEFINER to bypass the trigger / RLS)
CREATE OR REPLACE FUNCTION mock_checkout()
RETURNS void AS $$
BEGIN
  -- We disable the trigger for the duration of this transaction to allow the mock update
  -- Alternatively, we can just temporarily change the role or since SECURITY DEFINER runs as Postgres superuser,
  -- wait, SECURITY DEFINER still fires triggers. We need to set a local variable or disable the trigger.
  -- Let's just update the row directly. If the trigger blocks it because auth.uid() is not null, 
  -- actually auth.uid() is evaluated in the context of the session. 
  -- We can bypass the trigger by checking a config variable, but it's simpler to just disable it for this query.
  
  -- Disable the trigger
  ALTER TABLE public.users DISABLE TRIGGER enforce_subscription_update;
  
  -- Perform the update
  UPDATE public.users 
  SET onboarding_completed = true, subscription_status = 'active'
  WHERE id = auth.uid();
  
  -- Re-enable the trigger
  ALTER TABLE public.users ENABLE TRIGGER enforce_subscription_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
