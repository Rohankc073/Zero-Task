-- Migration: 20260731000000_seed_test_users.sql
-- Description: Inserts test users for dynamic UI role-based rendering.

-- Enable pgcrypto if not already enabled (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Insert into auth.users
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
  raw_user_meta_data, created_at, updated_at, confirmation_token
) VALUES 
(
  '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
  'depthead@zerotask.internal', extensions.crypt('zerotask123', extensions.gen_salt('bf')), now(), 
  '{"full_name": "Test Dept Head"}', now(), now(), ''
),
(
  '22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
  'manager@zerotask.internal', extensions.crypt('zerotask123', extensions.gen_salt('bf')), now(), 
  '{"full_name": "Test Manager"}', now(), now(), ''
),
(
  '33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
  'employee@zerotask.internal', extensions.crypt('zerotask123', extensions.gen_salt('bf')), now(), 
  '{"full_name": "Test Employee"}', now(), now(), ''
)
ON CONFLICT (id) DO NOTHING;

-- Also need to insert into auth.identities for login to work properly
INSERT INTO auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
) VALUES 
(
    '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', format('{"sub":"%s","email":"%s"}', '11111111-1111-4111-8111-111111111111', 'depthead@zerotask.internal')::jsonb, 'email', now(), now(), now(), '11111111-1111-4111-8111-111111111111'
),
(
    '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', format('{"sub":"%s","email":"%s"}', '22222222-2222-4222-8222-222222222222', 'manager@zerotask.internal')::jsonb, 'email', now(), now(), now(), '22222222-2222-4222-8222-222222222222'
),
(
    '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', format('{"sub":"%s","email":"%s"}', '33333333-3333-4333-8333-333333333333', 'employee@zerotask.internal')::jsonb, 'email', now(), now(), now(), '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 2. Insert into public.users
INSERT INTO public.users (id, email, full_name, role) VALUES 
('11111111-1111-4111-8111-111111111111', 'depthead@zerotask.internal', 'Test Dept Head', 'Department Head'::public.user_role_enum),
('22222222-2222-4222-8222-222222222222', 'manager@zerotask.internal', 'Test Manager', 'Manager'::public.user_role_enum),
('33333333-3333-4333-8333-333333333333', 'employee@zerotask.internal', 'Test Employee', 'Employee'::public.user_role_enum)
ON CONFLICT (id) DO UPDATE SET 
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name;

NOTIFY pgrst, 'reload schema';
