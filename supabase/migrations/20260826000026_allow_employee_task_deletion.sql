-- Migration: 20260826000026_allow_employee_task_deletion.sql
-- Description: Grant permission for Employees, Assignees, and Creators to delete their tasks and task assignees

-- 1. Enable RLS and drop outdated delete policies
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Management can delete their created tasks" ON public.tasks;
DROP POLICY IF EXISTS "Management can delete permitted tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete their tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authorized users can delete tasks" ON public.tasks;

-- 2. Comprehensive Task Delete Policy
CREATE POLICY "Authorized users can delete tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'Founder'
  OR created_by = auth.uid()
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid())
  OR (
    public.get_auth_user_role() IN ('Department Head', 'Manager')
    AND (department_id IS NULL OR department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()))
  )
);

-- 3. Comprehensive Task Assignees Delete Policy
DROP POLICY IF EXISTS "Authorized users can delete task_assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "Management can delete task_assignees" ON public.task_assignees;

CREATE POLICY "Authorized users can delete task_assignees"
ON public.task_assignees FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'Founder'
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.created_by = auth.uid() OR t.user_id = auth.uid()))
  OR (
    public.get_auth_user_role() IN ('Department Head', 'Manager')
  )
);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
