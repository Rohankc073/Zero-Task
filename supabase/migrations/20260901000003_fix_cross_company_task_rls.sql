-- Migration: Fix Cross-Company Task RLS and Task Assignee Visibility
-- Description: Allows assigned users across companies or for platform-level tasks (company_id is NULL) to view and update their assigned tasks.

CREATE OR REPLACE FUNCTION public.is_task_in_user_company(p_task_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tasks
        WHERE id = p_task_id AND (
            company_id IS NULL 
            OR p_company_id IS NULL 
            OR company_id = p_company_id 
            OR public.get_auth_user_role() = 'Super Admin'
            OR public.is_task_assigned_to_user(p_task_id, auth.uid())
        )
    );
$$;

-- 1. Founder policy
DROP POLICY IF EXISTS "Founder company task access" ON public.tasks;
CREATE POLICY "Founder company task access" ON public.tasks
FOR ALL
USING (
  (get_auth_user_role() = 'Founder'::text) AND (
    company_id = get_auth_user_company_id() 
    OR is_task_assigned_to_user(id, auth.uid())
    OR company_id IS NULL
  )
)
WITH CHECK (
  (get_auth_user_role() = 'Founder'::text) AND (
    company_id = get_auth_user_company_id() 
    OR company_id IS NULL
  )
);

-- 2. Department Head policy
DROP POLICY IF EXISTS "Department Head company task select" ON public.tasks;
CREATE POLICY "Department Head company task select" ON public.tasks
FOR SELECT
USING (
  (get_auth_user_role() = 'Department Head'::text) AND (
    (
      (company_id = get_auth_user_company_id()) AND (
        (created_by = auth.uid()) 
        OR is_task_assigned_to_user(id, auth.uid()) 
        OR ((department_id IS NOT NULL) AND (department_id = (SELECT users.department_id FROM users WHERE users.id = auth.uid()))) 
        OR (is_private IS FALSE OR is_private IS NULL)
      )
    )
    OR is_task_assigned_to_user(id, auth.uid())
    OR (company_id IS NULL AND is_task_assigned_to_user(id, auth.uid()))
  )
  AND (NOT ((created_by IN (SELECT users.id FROM users WHERE users.role = 'Founder'::text)) AND (is_private IS TRUE)))
);

DROP POLICY IF EXISTS "Department Head company task update" ON public.tasks;
CREATE POLICY "Department Head company task update" ON public.tasks
FOR UPDATE
USING (
  (get_auth_user_role() = 'Department Head'::text) AND (
    (company_id = get_auth_user_company_id() AND (
      (created_by = auth.uid()) 
      OR is_task_assigned_to_user(id, auth.uid()) 
      OR ((department_id IS NOT NULL) AND (department_id = (SELECT users.department_id FROM users WHERE users.id = auth.uid())))
    ))
    OR is_task_assigned_to_user(id, auth.uid())
  )
);

-- 3. Manager policy
DROP POLICY IF EXISTS "Manager company task select" ON public.tasks;
CREATE POLICY "Manager company task select" ON public.tasks
FOR SELECT
USING (
  (get_auth_user_role() = 'Manager'::text) AND (
    (
      (company_id = get_auth_user_company_id()) AND (
        (created_by = auth.uid()) 
        OR is_task_assigned_to_user(id, auth.uid()) 
        OR ((department_id IS NOT NULL) AND (department_id = (SELECT users.department_id FROM users WHERE users.id = auth.uid()))) 
        OR (is_private IS FALSE OR is_private IS NULL)
      )
    )
    OR is_task_assigned_to_user(id, auth.uid())
    OR (company_id IS NULL AND is_task_assigned_to_user(id, auth.uid()))
  )
  AND (NOT ((created_by IN (SELECT users.id FROM users WHERE users.role = 'Founder'::text)) AND (is_private IS TRUE)))
);

DROP POLICY IF EXISTS "Manager company task update" ON public.tasks;
CREATE POLICY "Manager company task update" ON public.tasks
FOR UPDATE
USING (
  (get_auth_user_role() = 'Manager'::text) AND (
    (company_id = get_auth_user_company_id() AND (
      (created_by = auth.uid()) 
      OR is_task_assigned_to_user(id, auth.uid()) 
      OR ((department_id IS NOT NULL) AND (department_id = (SELECT users.department_id FROM users WHERE users.id = auth.uid())))
    ))
    OR is_task_assigned_to_user(id, auth.uid())
  )
);

-- 4. Employee policy
DROP POLICY IF EXISTS "Employee company task select" ON public.tasks;
CREATE POLICY "Employee company task select" ON public.tasks
FOR SELECT
USING (
  (get_auth_user_role() = 'Employee'::text) AND (
    (
      (company_id = get_auth_user_company_id()) AND (
        (created_by = auth.uid()) 
        OR is_task_assigned_to_user(id, auth.uid())
      )
    )
    OR is_task_assigned_to_user(id, auth.uid())
    OR (company_id IS NULL AND is_task_assigned_to_user(id, auth.uid()))
  )
  AND (NOT ((created_by IN (SELECT users.id FROM users WHERE users.role = 'Founder'::text)) AND (is_private IS TRUE)))
);

DROP POLICY IF EXISTS "Employee company task update" ON public.tasks;
CREATE POLICY "Employee company task update" ON public.tasks
FOR UPDATE
USING (
  (get_auth_user_role() = 'Employee'::text) AND (
    (company_id = get_auth_user_company_id() AND ((created_by = auth.uid()) OR is_task_assigned_to_user(id, auth.uid())))
    OR is_task_assigned_to_user(id, auth.uid())
  )
);

-- 5. Task assignees policy
DROP POLICY IF EXISTS "Task assignees company access" ON public.task_assignees;
CREATE POLICY "Task assignees company access" ON public.task_assignees
FOR ALL
USING (
  (get_auth_user_role() = 'Super Admin'::text) 
  OR is_task_in_user_company(task_id, get_auth_user_company_id())
  OR user_id = auth.uid()
  OR is_task_assigned_to_user(task_id, auth.uid())
);
