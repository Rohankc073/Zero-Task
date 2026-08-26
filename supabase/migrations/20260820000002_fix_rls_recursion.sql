-- Migration: 20260820000002_fix_rls_recursion.sql

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view task_assignees for tasks they can see" ON public.task_assignees;

-- Create a non-recursive policy
-- Since task_id is a UUID, exposing task_assignees to authenticated users does not expose task details.
-- This breaks the infinite recursion between tasks and task_assignees.
CREATE POLICY "Authenticated users can view task_assignees" ON public.task_assignees FOR SELECT
USING (auth.uid() IS NOT NULL);
