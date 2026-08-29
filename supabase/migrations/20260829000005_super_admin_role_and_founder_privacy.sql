-- Migration: 20260829000005_super_admin_role_and_founder_privacy.sql
-- Description: Implement Super Admin role, operational access control, and Founder privacy protections.

-------------------------------------------------------------------------------
-- 1. Table Columns & Indexes
-------------------------------------------------------------------------------

-- Add is_private to tasks table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'is_private') THEN
        ALTER TABLE public.tasks ADD COLUMN is_private BOOLEAN DEFAULT false;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_is_private ON public.tasks (is_private);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);

-- Add is_private to meetings table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'is_private') THEN
        ALTER TABLE public.meetings ADD COLUMN is_private BOOLEAN DEFAULT false;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_is_private ON public.meetings (is_private);

-------------------------------------------------------------------------------
-- 2. Helper Functions for Authorization
-------------------------------------------------------------------------------

-- Check if user is Founder
CREATE OR REPLACE FUNCTION public.is_auth_founder()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Founder'
  );
$$;

-- Check if user is Super Admin
CREATE OR REPLACE FUNCTION public.is_auth_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'Super Admin'
  );
$$;

-- Check if user is Founder or Super Admin (Executive Administrator)
CREATE OR REPLACE FUNCTION public.is_auth_executive_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('Founder', 'Super Admin')
  );
$$;

-------------------------------------------------------------------------------
-- 3. Hardened Assignment Hierarchy Function (can_assign_task)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_assign_task(assignee_id UUID, assigner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    assigner_role text;
    assignee_role text;
BEGIN
    -- Prevent self-assignment here (self-assigned tasks handled via separate flow)
    IF assigner_id = assignee_id THEN
        RETURN FALSE;
    END IF;

    SELECT role::text INTO assigner_role FROM public.users WHERE id = assigner_id;
    SELECT role::text INTO assignee_role FROM public.users WHERE id = assignee_id;

    IF assignee_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Founder can assign to any existing user
    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    -- Super Admin can assign to anyone EXCEPT Founder (protecting Founder from arbitrary assignments)
    IF assigner_role = 'Super Admin' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    -- Department Head cannot assign to Founder or Super Admin
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role NOT IN ('Founder', 'Super Admin');
    END IF;

    -- Manager can assign to Managers and Employees
    IF assigner_role = 'Manager' THEN
        RETURN assignee_role NOT IN ('Founder', 'Super Admin', 'Department Head');
    END IF;

    -- Employee cannot delegate tasks
    RETURN FALSE;
END;
$$;

-------------------------------------------------------------------------------
-- 4. User Administration RPCs (Founder Protection & Super Admin Authority)
-------------------------------------------------------------------------------

-- 4a. Create User
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
    v_caller_role text;
    v_new_id UUID;
BEGIN
    SELECT role::text INTO v_caller_role FROM public.users WHERE id = auth.uid();

    IF v_caller_role NOT IN ('Founder', 'Super Admin') THEN
        RAISE EXCEPTION 'Only Founders and Super Admins can create users.';
    END IF;

    -- Protect Founder role: Super Admin cannot create a Founder
    IF v_caller_role = 'Super Admin' AND p_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not authorized to create Founder accounts.';
    END IF;

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

-- 4b. Update User
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
    v_caller_role text;
    v_target_role text;
BEGIN
    SELECT role::text INTO v_caller_role FROM public.users WHERE id = auth.uid();
    SELECT role::text INTO v_target_role FROM public.users WHERE id = p_target_user_id;

    IF v_caller_role NOT IN ('Founder', 'Super Admin') THEN
        RAISE EXCEPTION 'Only Founders and Super Admins can update users.';
    END IF;

    -- Founder Protection: Super Admin cannot modify a Founder account
    IF v_caller_role = 'Super Admin' AND v_target_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not permitted to modify Founder accounts.';
    END IF;

    -- Founder Protection: Super Admin cannot promote any account to Founder
    IF v_caller_role = 'Super Admin' AND p_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not permitted to grant the Founder role.';
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

-- 4c. Reset Password
CREATE OR REPLACE FUNCTION public.admin_reset_password(
    p_target_user_id UUID,
    p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_role text;
    v_target_role text;
BEGIN
    SELECT role::text INTO v_caller_role FROM public.users WHERE id = auth.uid();
    SELECT role::text INTO v_target_role FROM public.users WHERE id = p_target_user_id;

    IF v_caller_role NOT IN ('Founder', 'Super Admin') THEN
        RAISE EXCEPTION 'Only Founders and Super Admins can reset user passwords.';
    END IF;

    -- Founder Protection: Super Admin cannot reset Founder's password
    IF v_caller_role = 'Super Admin' AND v_target_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not permitted to reset Founder passwords.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_target_user_id;
END;
$$;

-- 4d. Delete (Soft Remove) User
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_role text;
    v_target_role text;
BEGIN
    SELECT role::text INTO v_caller_role FROM public.users WHERE id = auth.uid();
    SELECT role::text INTO v_target_role FROM public.users WHERE id = p_target_user_id;

    IF v_caller_role NOT IN ('Founder', 'Super Admin') THEN
        RAISE EXCEPTION 'Only Founders and Super Admins can remove users.';
    END IF;

    IF p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- Founder Protection: Super Admin cannot delete Founder
    IF v_caller_role = 'Super Admin' AND v_target_role = 'Founder' THEN
        RAISE EXCEPTION 'Super Admins are not permitted to remove Founder accounts.';
    END IF;

    -- Update auth.users
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        email = email || '_deleted_' || gen_random_uuid()::text,
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Update public.users
    UPDATE public.users
    SET is_active = false,
        is_deleted = true,
        email = email || '_deleted_' || gen_random_uuid()::text
    WHERE id = p_target_user_id;
END;
$$;

-------------------------------------------------------------------------------
-- 5. Task RLS Policies (Super Admin Operational Access & Founder Privacy)
-------------------------------------------------------------------------------

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
  END LOOP;
END $$;

-- 5a. Founder: Full access to all tasks (including private tasks)
CREATE POLICY "Founders have full access to all tasks"
ON public.tasks FOR ALL
TO authenticated
USING (public.get_auth_user_role() = 'Founder');

-- 5b. Super Admin: Organization-wide access to all non-private tasks + own tasks
CREATE POLICY "Super Admins have operational access to organizational tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  public.get_auth_user_role() = 'Super Admin'
  AND (
    created_by = auth.uid()
    OR is_private = false
    OR is_private IS NULL
    OR NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
);

CREATE POLICY "Super Admins can insert organizational tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
  public.get_auth_user_role() = 'Super Admin'
);

CREATE POLICY "Super Admins can update organizational tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
  public.get_auth_user_role() = 'Super Admin'
  AND (
    created_by = auth.uid()
    OR is_private = false
    OR is_private IS NULL
    OR NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
);

CREATE POLICY "Super Admins can delete organizational tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'Super Admin'
  AND (
    created_by = auth.uid()
    OR is_private = false
    OR is_private IS NULL
    OR NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
);

-- 5c. Department Head & Manager (SELECT & UPDATE)
CREATE POLICY "Management can view permitted tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    (
      is_private = false OR is_private IS NULL OR created_by = auth.uid()
    )
    AND NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid() OR 
    (
      public.get_auth_user_role() = 'Department Head' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND 
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      department_id IS NULL AND
      EXISTS (
        SELECT 1 FROM public.task_assignees ta
        JOIN public.users assignee ON ta.user_id = assignee.id
        WHERE ta.task_id = tasks.id
        AND assignee.role = 'Employee'
        AND assignee.department_id = (SELECT department_id FROM public.users WHERE id = auth.uid())
        AND assignee.department_id IS NOT NULL
      )
    )
  )
);

CREATE POLICY "Management can insert tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
);

CREATE POLICY "Management can update permitted tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND (
    (is_private = false OR is_private IS NULL OR created_by = auth.uid())
    AND NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR
    created_by = auth.uid() OR
    (
      public.get_auth_user_role() = 'Department Head' AND
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    ) OR
    (
      public.get_auth_user_role() = 'Manager' AND
      department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()) AND
      department_id IS NOT NULL
    )
  )
);

CREATE POLICY "Management can delete their created tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() IN ('Department Head', 'Manager')
  AND created_by = auth.uid()
);

-- 5d. Employee: View and Update assigned/created tasks
CREATE POLICY "Employees can view assigned tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (
  public.get_auth_user_role() = 'Employee'
  AND (
    (is_private = false OR is_private IS NULL OR created_by = auth.uid())
    AND NOT (created_by IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
  )
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR 
    created_by = auth.uid()
  )
);

CREATE POLICY "Employees can insert tasks"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
  public.get_auth_user_role() = 'Employee'
);

CREATE POLICY "Employees can update assigned tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
  public.get_auth_user_role() = 'Employee'
  AND (
    EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()) OR
    created_by = auth.uid()
  )
);

CREATE POLICY "Employees can delete own created tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'Employee'
  AND created_by = auth.uid()
);

-------------------------------------------------------------------------------
-- 6. Task Assignees RLS Policies
-------------------------------------------------------------------------------

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_assignees') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.task_assignees', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can view task_assignees"
ON public.task_assignees FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized users can insert task_assignees"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (
  public.can_assign_task(user_id, auth.uid())
  OR user_id = auth.uid()
  OR public.get_auth_user_role() IN ('Founder', 'Super Admin')
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  OR public.get_auth_user_role() IN ('Department Head', 'Manager')
);

CREATE POLICY "Authorized users can delete task_assignees"
ON public.task_assignees FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() IN ('Founder', 'Super Admin')
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  OR public.get_auth_user_role() IN ('Department Head', 'Manager')
);

-------------------------------------------------------------------------------
-- 7. Meeting RLS Policies (Super Admin & Founder Privacy)
-------------------------------------------------------------------------------

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'meetings') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.meetings', r.policyname);
  END LOOP;
END $$;

-- Meetings SELECT
CREATE POLICY "meetings_select_policy"
ON public.meetings FOR SELECT
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR (
    public.get_auth_user_role() = 'Super Admin'
    AND (
      is_private = false 
      OR is_private IS NULL 
      OR organizer_id = auth.uid()
      OR NOT (organizer_id IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
    )
  )
  OR public.is_meeting_participant(id, auth.uid())
);

-- Meetings INSERT
CREATE POLICY "meetings_insert_policy"
ON public.meetings FOR INSERT
TO authenticated
WITH CHECK (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() IN ('Founder', 'Super Admin')
);

-- Meetings UPDATE
CREATE POLICY "meetings_update_policy"
ON public.meetings FOR UPDATE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR (
    public.get_auth_user_role() = 'Super Admin'
    AND (
      is_private = false 
      OR is_private IS NULL 
      OR organizer_id = auth.uid()
      OR NOT (organizer_id IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
    )
  )
);

-- Meetings DELETE
CREATE POLICY "meetings_delete_policy"
ON public.meetings FOR DELETE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
  OR (
    public.get_auth_user_role() = 'Super Admin'
    AND (
      is_private = false 
      OR is_private IS NULL 
      OR organizer_id = auth.uid()
      OR NOT (organizer_id IN (SELECT id FROM public.users WHERE role = 'Founder') AND is_private = true)
    )
  )
);

-------------------------------------------------------------------------------
-- 8. Designations Management Policy (Super Admin Access)
-------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Founders can manage company designations" ON public.designations;
CREATE POLICY "Founders and Super Admins can manage company designations" 
ON public.designations FOR ALL
TO authenticated
USING (
  public.get_auth_user_role() IN ('Founder', 'Super Admin')
);
