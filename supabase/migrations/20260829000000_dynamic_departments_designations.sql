-- Migration: 20260829000000_dynamic_departments_designations.sql
-- Description: Dynamic Departments and Designations Architecture

-------------------------------------------------------------------------------
-- 1. Modify Departments
-------------------------------------------------------------------------------
-- Ensure we have company_id (safe to ignore if it already exists, but we'll add if missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'company_id') THEN
        ALTER TABLE public.departments ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'description') THEN
        ALTER TABLE public.departments ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'updated_at') THEN
        ALTER TABLE public.departments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- Drop the old unique constraint on name and replace with (company_id, name)
ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_name_key;
ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_company_id_name_key;
ALTER TABLE public.departments ADD CONSTRAINT departments_company_id_name_key UNIQUE (company_id, name);

-------------------------------------------------------------------------------
-- 2. Create Designations Table
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.designations (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT designations_company_id_name_key UNIQUE (company_id, name)
);

-- Enable RLS
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;

-- Policies for Designations
CREATE POLICY "Anyone can view company designations" ON public.designations
    FOR SELECT USING (true);

CREATE POLICY "Founders can manage company designations" ON public.designations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'Founder'
        )
    );

-------------------------------------------------------------------------------
-- 3. Modify Users Table
-------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'designation_id') THEN
        ALTER TABLE public.users ADD COLUMN designation_id UUID REFERENCES public.designations(id) ON DELETE SET NULL;
    END IF;
END $$;

-------------------------------------------------------------------------------
-- 4. Update Admin RPCs
-------------------------------------------------------------------------------

-- 4a. Update admin_create_user
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role public.user_role_enum,
    p_department_id UUID,
    p_phone TEXT,
    p_designation_id UUID DEFAULT NULL
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
    UPDATE public.users
    SET full_name = p_full_name,
        role = p_role,
        department_id = p_department_id,
        designation_id = p_designation_id,
        phone_number = p_phone,
        is_active = true,
        is_deleted = false,
        is_approved = true,
        status = 'Approved'
    WHERE id = v_new_id;

    RETURN v_new_id;
END;
$$;

-- 4b. Update admin_update_user
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_target_user_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_role public.user_role_enum,
    p_department_id UUID,
    p_phone TEXT,
    p_is_active BOOLEAN,
    p_designation_id UUID DEFAULT NULL
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
        designation_id = p_designation_id,
        phone_number = p_phone,
        is_active = p_is_active
    WHERE id = p_target_user_id;
END;
$$;
