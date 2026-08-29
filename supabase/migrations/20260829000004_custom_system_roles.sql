-- Migration: 20260829000004_custom_system_roles.sql
-- Description: Add base_role to designations to support dynamic system roles inheriting structural permissions

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'designations' AND column_name = 'base_role') THEN
        ALTER TABLE public.designations ADD COLUMN base_role public.user_role_enum DEFAULT 'Employee'::public.user_role_enum;
    END IF;
END $$;
