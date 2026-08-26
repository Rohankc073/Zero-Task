-- Add execution_classification to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS execution_classification TEXT DEFAULT 'Operational';
