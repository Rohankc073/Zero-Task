-- Fix missing foreign keys on tasks table
-- Clean up any invalid random UUIDs that were generated
UPDATE public.tasks
SET user_id = NULL
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.users);

UPDATE public.tasks
SET department_id = NULL
WHERE department_id IS NOT NULL AND department_id NOT IN (SELECT id FROM public.departments);

ALTER TABLE public.tasks ALTER COLUMN user_id DROP DEFAULT;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

NOTIFY pgrst, 'reload schema';
