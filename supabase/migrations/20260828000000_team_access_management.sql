-- Migration: 20260828000000_team_access_management.sql
-- Description: Adds Super Admin role, account status fields, and Founder-only RPCs for user management.

-------------------------------------------------------------------------------
-- 1. Enums and Table Alterations
-------------------------------------------------------------------------------
-- Add Super Admin to user_role_enum
ALTER TYPE public.user_role_enum ADD VALUE IF NOT EXISTS 'Super Admin';

-- Add is_active and is_deleted to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-------------------------------------------------------------------------------
-- 2. Founder RPC: Create User
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role public.user_role_enum,
    p_department_id UUID,
    p_phone TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_new_id UUID;
    v_is_founder BOOLEAN;
BEGIN
    -- Authorize Founder Only
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'Founder'
    ) INTO v_is_founder;

    IF NOT v_is_founder THEN
        RAISE EXCEPTION 'Only Founders can create users.';
    END IF;

    -- Generate UUID for the new user
    v_new_id := gen_random_uuid();

    -- Insert into auth.users using extensions.crypt
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated', 
        p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', 
        json_build_object('full_name', p_full_name, 'role', p_role), 
        now(), now(), p_phone
    );

    -- Ensure public.users entry is updated with full fields 
    -- (The on_auth_user_created trigger will run, so we just UPDATE it)
    UPDATE public.users
    SET full_name = p_full_name,
        role = p_role,
        department_id = p_department_id,
        phone_number = p_phone,
        is_active = true,
        is_deleted = false,
        is_approved = true,
        status = 'Approved'
    WHERE id = v_new_id;

    RETURN v_new_id;
END;
$$;

-------------------------------------------------------------------------------
-- 3. Founder RPC: Update User
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_target_user_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_role public.user_role_enum,
    p_department_id UUID,
    p_phone TEXT,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_founder BOOLEAN;
BEGIN
    -- Authorize Founder Only
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'Founder'
    ) INTO v_is_founder;

    IF NOT v_is_founder THEN
        RAISE EXCEPTION 'Only Founders can update users.';
    END IF;

    -- Update auth.users
    UPDATE auth.users
    SET email = p_email,
        phone = p_phone,
        raw_user_meta_data = json_build_object('full_name', p_full_name, 'role', p_role),
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Update public.users
    UPDATE public.users
    SET email = p_email,
        full_name = p_full_name,
        role = p_role,
        department_id = p_department_id,
        phone_number = p_phone,
        is_active = p_is_active
    WHERE id = p_target_user_id;
END;
$$;

-------------------------------------------------------------------------------
-- 4. Founder RPC: Reset Password
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_password(
    p_target_user_id UUID,
    p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_founder BOOLEAN;
BEGIN
    -- Authorize Founder Only
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'Founder'
    ) INTO v_is_founder;

    IF NOT v_is_founder THEN
        RAISE EXCEPTION 'Only Founders can reset passwords.';
    END IF;

    -- Update auth.users encrypted_password
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_target_user_id;
END;
$$;

-------------------------------------------------------------------------------
-- 5. Founder RPC: Delete (Soft Remove) User
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_founder BOOLEAN;
BEGIN
    -- Authorize Founder Only
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'Founder'
    ) INTO v_is_founder;

    IF NOT v_is_founder THEN
        RAISE EXCEPTION 'Only Founders can delete users.';
    END IF;

    IF p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete yourself.';
    END IF;

    -- Update auth.users: Scramble password to lock out, remove email to allow reuse if needed
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        email = email || '_deleted_' || gen_random_uuid()::text,
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Update public.users: Mark deleted
    UPDATE public.users
    SET is_active = false,
        is_deleted = true,
        email = email || '_deleted_' || gen_random_uuid()::text
    WHERE id = p_target_user_id;
END;
$$;
