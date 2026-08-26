-- Migration: 20260821140000_forensic_hardening.sql
-- Description: Complete forensic database consistency repair: assignment validation, multi-assignee RLS, meeting RLS, and trigger hardening.

-- 1. Hardened can_assign_task function (enforces business hierarchy & rejects self-assignment)
CREATE OR REPLACE FUNCTION public.can_assign_task(assignee_id UUID, assigner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    assigner_role text;
    assigner_dept UUID;
    assignee_role text;
    assignee_dept UUID;
BEGIN
    -- Prevent self-assignment for all roles (rule requirement)
    IF assigner_id = assignee_id THEN
        RETURN FALSE;
    END IF;

    SELECT role::text, department_id INTO assigner_role, assigner_dept 
    FROM public.users WHERE id = assigner_id;
    
    SELECT role::text, department_id INTO assignee_role, assignee_dept 
    FROM public.users WHERE id = assignee_id;

    -- If assignee does not exist, reject
    IF assignee_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Founder can assign to any existing user (except themselves, checked above)
    IF assigner_role = 'Founder' THEN
        RETURN TRUE;
    END IF;

    -- Department Head cannot assign to Founder
    IF assigner_role = 'Department Head' THEN
        RETURN assignee_role != 'Founder';
    END IF;

    -- Manager can assign to Managers and Employees (cannot assign to Founder or Dept Head)
    IF assigner_role = 'Manager' THEN
        RETURN assignee_role NOT IN ('Founder', 'Department Head');
    END IF;

    -- Employee cannot assign tasks
    RETURN FALSE;
END;
$$;


-- 2. Hardened RLS Policies for task_assignees
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_assignees') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.task_assignees', r.policyname);
  END LOOP;
END $$;

-- View policy: Authenticated users can view task assignees
CREATE POLICY "Authenticated users can view task_assignees"
ON public.task_assignees FOR SELECT
TO authenticated
USING (true);

-- Insert policy: Creators, Managers, Dept Heads, and Founders can assign permitted users
CREATE POLICY "Authorized users can insert task_assignees"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (
  public.can_assign_task(user_id, auth.uid())
  AND (
    public.get_auth_user_role() = 'Founder'
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
    OR public.get_auth_user_role() IN ('Department Head', 'Manager')
  )
);

-- Delete policy: Creators, Managers, Dept Heads, and Founders can remove assignees
CREATE POLICY "Authorized users can delete task_assignees"
ON public.task_assignees FOR DELETE
TO authenticated
USING (
  public.get_auth_user_role() = 'Founder'
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  OR public.get_auth_user_role() IN ('Department Head', 'Manager')
);


-- 3. Hardened RLS Policies for meetings & meeting_participants
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'meetings') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.meetings', r.policyname);
  END LOOP;
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'meeting_participants') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.meeting_participants', r.policyname);
  END LOOP;
END $$;

-- Meetings Policies
CREATE POLICY "Users can view relevant meetings"
ON public.meetings FOR SELECT
TO authenticated
USING (
  organizer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = meetings.id AND mp.user_id = auth.uid())
  OR public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "Users can insert meetings"
ON public.meetings FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = organizer_id
  OR public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "Organizers and Founders can update meetings"
ON public.meetings FOR UPDATE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
);

CREATE POLICY "Organizers and Founders can delete meetings"
ON public.meetings FOR DELETE
TO authenticated
USING (
  organizer_id = auth.uid()
  OR public.get_auth_user_role() = 'Founder'
);

-- Meeting Participants Policies
CREATE POLICY "Users can view relevant meeting_participants"
ON public.meeting_participants FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.get_auth_user_role() = 'Founder'))
);

CREATE POLICY "Organizers and Founders can insert meeting_participants"
ON public.meeting_participants FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.get_auth_user_role() = 'Founder'))
);

CREATE POLICY "Organizers and Founders can delete meeting_participants"
ON public.meeting_participants FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.organizer_id = auth.uid() OR public.get_auth_user_role() = 'Founder'))
);


-- 4. Hardened check_employee_task_update (no stale project_id references)
CREATE OR REPLACE FUNCTION public.check_employee_task_update()
RETURNS trigger AS $$
DECLARE
    user_role text;
    old_project uuid;
    new_project uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    user_role := public.get_auth_user_role();

    IF user_role = 'Employee' THEN
        IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
            RAISE EXCEPTION 'Employees are not permitted to change the department of a task.';
        END IF;

        -- Check if they changed milestone to one belonging to a different project
        IF OLD.milestone_id IS DISTINCT FROM NEW.milestone_id THEN
            SELECT project_id INTO old_project FROM public.project_milestones WHERE id = OLD.milestone_id;
            SELECT project_id INTO new_project FROM public.project_milestones WHERE id = NEW.milestone_id;
            IF old_project IS DISTINCT FROM new_project THEN
                RAISE EXCEPTION 'Employees are not permitted to move a task to a different project.';
            END IF;
        END IF;

        IF OLD.title IS DISTINCT FROM NEW.title THEN
            RAISE EXCEPTION 'Employees are not permitted to change task title.';
        END IF;

        IF OLD.description IS DISTINCT FROM NEW.description THEN
            RAISE EXCEPTION 'Employees are not permitted to change task description.';
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            RAISE EXCEPTION 'Employees are not permitted to change task priority.';
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            RAISE EXCEPTION 'Employees are not permitted to change task due date.';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
            RAISE EXCEPTION 'Employees are not permitted to change task creator.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Hardened log_task_activity (no stale project_id references)
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_project_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Retrieve project_id from milestone_id dynamically if available
    IF TG_OP = 'DELETE' THEN
        IF OLD.milestone_id IS NOT NULL THEN
            SELECT project_id INTO v_project_id FROM public.project_milestones WHERE id = OLD.milestone_id;
        END IF;
    ELSE
        IF NEW.milestone_id IS NOT NULL THEN
            SELECT project_id INTO v_project_id FROM public.project_milestones WHERE id = NEW.milestone_id;
        END IF;
    END IF;
    
    IF TG_OP = 'INSERT' THEN
        IF v_user_id IS NULL THEN
            v_user_id := NEW.created_by;
        END IF;

        INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
        VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_created', jsonb_build_object(
            'title', NEW.title,
            'status', NEW.status,
            'priority', NEW.priority
        ));
        
        IF NEW.parent_task_id IS NOT NULL THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.parent_task_id, v_project_id, NEW.milestone_id, v_user_id, 'subtask_created', jsonb_build_object(
                'subtask_id', NEW.id,
                'title', NEW.title
            ));
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'status_changed', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
            
            IF NEW.status = 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_completed', jsonb_build_object());
                
                IF NEW.parent_task_id IS NOT NULL THEN
                    INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                    VALUES (NEW.parent_task_id, v_project_id, NEW.milestone_id, v_user_id, 'subtask_completed', jsonb_build_object(
                        'subtask_id', NEW.id,
                        'title', NEW.title
                    ));
                END IF;
            END IF;
            
            IF OLD.status = 'Done' AND NEW.status != 'Done' THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_reopened', jsonb_build_object());
            END IF;
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'priority_changed', jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority));
        END IF;

        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            IF OLD.user_id IS NULL THEN
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_assigned', jsonb_build_object('assignee_id', NEW.user_id));
            ELSE
                INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
                VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'task_reassigned', jsonb_build_object('old_assignee_id', OLD.user_id, 'new_assignee_id', NEW.user_id));
            END IF;
        END IF;

        IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'due_date_changed', jsonb_build_object('old_date', OLD.due_date, 'new_date', NEW.due_date));
        END IF;
        
        IF OLD.description IS DISTINCT FROM NEW.description THEN
            INSERT INTO public.execution_activity (task_id, project_id, milestone_id, user_id, event_type, metadata)
            VALUES (NEW.id, v_project_id, NEW.milestone_id, v_user_id, 'description_changed', '{}'::jsonb);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.execution_activity (project_id, milestone_id, user_id, event_type, metadata)
        VALUES (v_project_id, OLD.milestone_id, v_user_id, 'task_deleted', jsonb_build_object('task_title', OLD.title));
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
