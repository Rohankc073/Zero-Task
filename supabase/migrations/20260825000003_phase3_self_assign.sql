-- Phase 3: Self-assignment + Deadline Hierarchy

-- 1. Allow Employees to create tasks that they self-assign
-- Currently only Founder, Dept Head, and Manager can create tasks.
-- We add a policy so ANY user can create a task for themselves.
DROP POLICY IF EXISTS "Users can create self-assigned tasks" ON public.tasks;
CREATE POLICY "Users can create self-assigned tasks"
ON public.tasks FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND (department_id IS NULL OR department_id = (SELECT department_id FROM public.users WHERE id = auth.uid()))
);

-- 2. Allow users to insert themselves into task_assignees (Self-Assign)
DROP POLICY IF EXISTS "Users can self assign tasks" ON public.task_assignees;
CREATE POLICY "Users can self assign tasks"
ON public.task_assignees FOR INSERT
WITH CHECK (user_id = auth.uid());

-- 3. To track deadline edits and enforce hierarchy, we can add a tracking column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS initial_deadline_set BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deadline_last_modified_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. RLS for Deadline Update Enforcement
-- We will write a trigger function to enforce the hierarchy rules on due_date updates
CREATE OR REPLACE FUNCTION public.enforce_deadline_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updater_role text;
    v_creator_role text;
BEGIN
    -- Only trigger if due_date is changing
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
        SELECT role INTO v_updater_role FROM public.users WHERE id = auth.uid();
        SELECT role INTO v_creator_role FROM public.users WHERE id = NEW.created_by;

        -- If creator is updating, they can only set it once (when OLD.due_date was NULL)
        IF auth.uid() = NEW.created_by THEN
            IF OLD.due_date IS NOT NULL THEN
                RAISE EXCEPTION 'Creator cannot modify the deadline once it is set.';
            END IF;
        ELSE
            -- Superior checking
            -- Founder can always change it
            IF v_updater_role = 'Founder' THEN
                RETURN NEW;
            END IF;
            
            -- Department Head can change Manager or Employee deadlines
            IF v_updater_role = 'Department Head' AND v_creator_role IN ('Manager', 'Employee') THEN
                RETURN NEW;
            END IF;
            
            -- Manager can change Employee deadlines
            IF v_updater_role = 'Manager' AND v_creator_role = 'Employee' THEN
                RETURN NEW;
            END IF;
            
            -- Otherwise, block
            RAISE EXCEPTION 'You do not have permission to modify this deadline.';
        END IF;

        NEW.deadline_last_modified_by := auth.uid();
        NEW.initial_deadline_set := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_deadline_hierarchy ON public.tasks;
CREATE TRIGGER trg_enforce_deadline_hierarchy
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_deadline_hierarchy();
