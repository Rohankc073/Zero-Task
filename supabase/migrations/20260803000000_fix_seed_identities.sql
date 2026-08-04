-- Fix missing auth.identities for seeded users
-- Supabase GoTrue requires an identity row for the 'email' provider in order to log in with a password.

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT 
  gen_random_uuid(), 
  id, 
  id::text, 
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 
  'email', 
  now(), 
  now()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM auth.identities);
