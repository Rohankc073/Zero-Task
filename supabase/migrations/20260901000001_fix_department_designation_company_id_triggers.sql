-- Migration: 20260901000001_fix_department_designation_company_id_triggers.sql
-- Fixes automatic company_id resolution for departments, designations, and admin user creation

-- 1. Create or replace department company_id trigger
CREATE OR REPLACE FUNCTION public.trg_departments_set_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role text;
    v_user_company_id uuid;
BEGIN
    SELECT role::text, company_id INTO v_user_role, v_user_company_id FROM public.users WHERE id = auth.uid();
    
    IF v_user_role != 'Super Admin' THEN
        NEW.company_id := COALESCE(NEW.company_id, v_user_company_id);
        IF NEW.company_id IS NOT NULL AND v_user_company_id IS NOT NULL AND NEW.company_id != v_user_company_id THEN
            RAISE EXCEPTION 'Cross-company department creation is strictly prohibited';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_dept_company_id ON public.departments;
CREATE TRIGGER trg_set_dept_company_id
BEFORE INSERT ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.trg_departments_set_company_id();

-- 2. Create or replace designation company_id trigger
CREATE OR REPLACE FUNCTION public.trg_designations_set_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role text;
    v_user_company_id uuid;
BEGIN
    SELECT role::text, company_id INTO v_user_role, v_user_company_id FROM public.users WHERE id = auth.uid();
    
    IF v_user_role != 'Super Admin' THEN
        NEW.company_id := COALESCE(NEW.company_id, v_user_company_id);
        IF NEW.company_id IS NOT NULL AND v_user_company_id IS NOT NULL AND NEW.company_id != v_user_company_id THEN
            RAISE EXCEPTION 'Cross-company designation creation is strictly prohibited';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_designation_company_id ON public.designations;
CREATE TRIGGER trg_set_designation_company_id
BEFORE INSERT ON public.designations
FOR EACH ROW
EXECUTE FUNCTION public.trg_designations_set_company_id();

-- 3. Update admin_create_user with flexible company_id resolution
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email text,
    p_password text,
    p_full_name text,
    p_role text,
    p_department_id uuid DEFAULT NULL::uuid,
    p_phone text DEFAULT NULL::text,
    p_designation_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller record;
    v_target_company_id uuid;
    v_new_id UUID;
    v_clean_email text;
    v_clean_phone text;
BEGIN
    SELECT role::text as role, company_id INTO v_caller FROM public.users WHERE id = auth.uid();

    IF v_caller.role NOT IN ('Founder', 'Super Admin') THEN
        RAISE EXCEPTION 'Only Founders and Super Admins can create users.';
    END IF;

    -- Protect Founder role: Super Admin cannot create a Founder
    IF v_caller.role = 'Super Admin' AND p_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not authorized to create Founder accounts.';
    END IF;

    -- Determine target company_id
    IF v_caller.company_id IS NOT NULL THEN
        v_target_company_id := v_caller.company_id;
    ELSIF p_department_id IS NOT NULL THEN
        SELECT company_id INTO v_target_company_id FROM public.departments WHERE id = p_department_id;
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    v_clean_phone := NULLIF(TRIM(p_phone), '');
    v_new_id := gen_random_uuid();

    -- Insert into auth.users with complete non-null GoTrue fields
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        invited_at,
        confirmation_token,
        confirmation_sent_at,
        recovery_token,
        recovery_sent_at,
        email_change_token_new,
        email_change,
        email_change_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        phone,
        phone_confirmed_at,
        phone_change,
        phone_change_token,
        phone_change_sent_at,
        email_change_token_current,
        email_change_confirm_status,
        banned_until,
        reauthentication_token,
        reauthentication_sent_at,
        is_sso_user,
        deleted_at,
        is_anonymous
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_id,
        'authenticated',
        'authenticated',
        v_clean_email,
        extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        now(),
        NULL,
        '',
        NULL,
        '',
        NULL,
        '',
        '',
        NULL,
        NULL,
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', p_full_name, 'role', p_role, 'company_id', v_target_company_id, 'phone_number', v_clean_phone, 'email_verified', true),
        NULL,
        now(),
        now(),
        v_clean_phone,
        NULL,
        '',
        '',
        NULL,
        '',
        0,
        NULL,
        '',
        NULL,
        false,
        NULL,
        false
    );

    -- Insert into auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_new_id,
        jsonb_build_object('sub', v_new_id::text, 'email', v_clean_email, 'email_verified', true),
        'email',
        v_new_id::text,
        now(),
        now(),
        now()
    );

    -- Ensure public.users entry is updated with full fields 
    UPDATE public.users
    SET full_name = p_full_name,
        name = p_full_name,
        role = p_role,
        company_id = v_target_company_id,
        department_id = p_department_id,
        designation_id = p_designation_id,
        phone_number = v_clean_phone,
        is_active = true,
        is_deleted = false,
        is_approved = true,
        status = 'Approved'
    WHERE id = v_new_id;

    RETURN v_new_id;
END;
$$;
