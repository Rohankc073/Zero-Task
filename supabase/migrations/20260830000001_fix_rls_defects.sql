-- Migration: 20260830000001_fix_rls_defects.sql
-- Patches D-004 (task_assignees INSERT RLS) and D-005 (password_resets scoping).

-- ============================================================
-- D-004: Fix task_assignees INSERT policy (overly permissive)
-- Remove the final OR clause that allows any Dept Head / Manager
-- to insert any assignee on any task regardless of can_assign_task.
-- ============================================================

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Authorized users can insert task_assignees" ON public.task_assignees;

-- Recreate with correct logic
CREATE POLICY "Authorized users can insert task_assignees"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (
  -- Founder and Super Admin have full authority
  public.get_auth_user_role() IN ('Founder', 'Super Admin')
  -- Task creator can assign
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  -- Self-assignment is always allowed
  OR user_id = auth.uid()
  -- Explicit hierarchical check (replaces the blanket DH/Manager clause)
  OR public.can_assign_task(user_id, auth.uid())
);

-- ============================================================
-- D-005: Fix password_resets RLS (too broad — grants all managers
-- access to all resets regardless of department)
-- ============================================================

-- Drop existing approver policy
DROP POLICY IF EXISTS "Approvers can manage requests" ON public.password_resets;

-- Recreate with department-scoped logic for managers and dept heads
CREATE POLICY "Approvers can manage requests"
ON public.password_resets FOR ALL
USING (
  -- Founder sees all
  public.get_auth_user_role() = 'Founder'
  -- Super Admin sees all (non-founder)
  OR public.get_auth_user_role() = 'Super Admin'
  -- Department Head: only their department employees
  OR (
    public.get_auth_user_role() = 'Department Head'
    AND EXISTS (
      SELECT 1 FROM public.users req
      JOIN public.users approver ON approver.id = auth.uid()
      WHERE req.id = public.password_resets.user_id
        AND req.department_id = approver.department_id
    )
  )
  -- Manager: only their department employees
  OR (
    public.get_auth_user_role() = 'Manager'
    AND EXISTS (
      SELECT 1 FROM public.users req
      JOIN public.users approver ON approver.id = auth.uid()
      WHERE req.id = public.password_resets.user_id
        AND req.department_id = approver.department_id
    )
  )
);
