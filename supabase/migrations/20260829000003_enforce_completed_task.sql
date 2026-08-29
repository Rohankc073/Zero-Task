-- Create trigger to prevent reverting completed tasks to an incomplete state

CREATE OR REPLACE FUNCTION check_enforce_completed_task()
RETURNS TRIGGER AS $$
BEGIN
    -- If the task was already completed ('Done' or 'Completed')
    IF OLD.status IN ('Done', 'Completed') THEN
        -- And the new status is NOT 'Done' or 'Completed'
        IF NEW.status NOT IN ('Done', 'Completed') THEN
            RAISE EXCEPTION 'A completed task cannot be reverted to an incomplete status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trg_enforce_completed_task ON public.tasks;

-- Create the before update trigger
CREATE TRIGGER trg_enforce_completed_task
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION check_enforce_completed_task();
