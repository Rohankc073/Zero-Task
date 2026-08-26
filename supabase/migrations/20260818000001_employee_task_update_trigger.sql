-- Migration: 20260818000001_employee_task_update_trigger.sql
-- Description: Creates a BEFORE UPDATE trigger to prevent Employees from mutating structural task fields (user_id, department_id, project_id).

CREATE OR REPLACE FUNCTION public.check_employee_task_update()
RETURNS trigger AS $$
DECLARE
    user_role text;
BEGIN
    -- Only enforce this for authenticated users modifying through the API
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the role of the user performing the update
    user_role := public.get_auth_user_role();

    -- If the user is an Employee, lock down user_id, department_id, and project_id
    IF user_role = 'Employee' THEN
        -- Prevent changing assignee
        IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
            RAISE EXCEPTION 'Employees are not permitted to reassign tasks (user_id is immutable for this role).';
        END IF;

        -- Prevent changing department
        IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
            RAISE EXCEPTION 'Employees are not permitted to change the department of a task.';
        END IF;

        -- Prevent changing project
        IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
            RAISE EXCEPTION 'Employees are not permitted to move a task to a different project.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trg_check_employee_task_update ON public.tasks;

-- Create the BEFORE UPDATE trigger on tasks
CREATE TRIGGER trg_check_employee_task_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.check_employee_task_update();
