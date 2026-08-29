-- Migration: 20260829000006_create_test_superadmin.sql
-- Description: Seed test Super Admin account (superadmin@gmail.com / Test@123)

DO $$
DECLARE
    v_user_id UUID;
    v_dept_id UUID;
BEGIN
    -- Get default department
    SELECT id INTO v_dept_id FROM public.departments LIMIT 1;

    -- Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'superadmin@gmail.com';

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', 
            'superadmin@gmail.com', extensions.crypt('Test@123', extensions.gen_salt('bf')), now(), 
            '{"provider":"email","providers":["email"]}', 
            json_build_object('full_name', 'Super Admin', 'role', 'Super Admin'), 
            now(), now(), '+10000000000'
        );
    ELSE
        -- Update password and metadata
        UPDATE auth.users
        SET encrypted_password = extensions.crypt('Test@123', extensions.gen_salt('bf')),
            raw_user_meta_data = json_build_object('full_name', 'Super Admin', 'role', 'Super Admin'),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    -- Upsert public.users
    INSERT INTO public.users (
        id, email, full_name, role, department_id, is_active, is_deleted, is_approved, status, onboarding_completed
    )
    VALUES (
        v_user_id, 'superadmin@gmail.com', 'Super Admin', 'Super Admin', v_dept_id, true, false, true, 'Approved', true
    )
    ON CONFLICT (id) DO UPDATE
    SET email = 'superadmin@gmail.com',
        full_name = 'Super Admin',
        role = 'Super Admin',
        is_active = true,
        is_deleted = false,
        is_approved = true,
        status = 'Approved',
        onboarding_completed = true;

END $$;
