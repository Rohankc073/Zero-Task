-- 1. Drop trigger and functions
DROP TRIGGER IF EXISTS enforce_subscription_update ON public.users;
DROP FUNCTION IF EXISTS check_subscription_update();
DROP FUNCTION IF EXISTS mock_checkout();

-- 2. Drop columns from public.users
ALTER TABLE public.users 
DROP COLUMN IF EXISTS stripe_customer_id,
DROP COLUMN IF EXISTS subscription_status;

-- 3. Drop ENUM type
DROP TYPE IF EXISTS subscription_status;
