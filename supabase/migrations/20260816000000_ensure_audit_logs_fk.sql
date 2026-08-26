-- Ensure Foreign Key relationship between audit_logs and users exists for PostgREST schema cache
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_type = 'FOREIGN KEY' 
        AND table_name = 'audit_logs'
    ) THEN
        ALTER TABLE public.audit_logs
        ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
