-- Migration: 20260829000002_sync_done_progress.sql
-- Description: Automatically set progress to 100% when task is marked as Done

CREATE OR REPLACE FUNCTION public.sync_task_done_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status changes to Done or Completed, ensure progress is 100
  IF NEW.status IN ('Done', 'Completed') AND (OLD.status NOT IN ('Done', 'Completed') OR OLD.status IS NULL) THEN
    NEW.progress := 100;
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  -- If status changes AWAY from Done/Completed and progress is still 100, reset it (optional but good practice)
  -- Actually, let's just let the user reset the progress if they want.
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_done_progress ON public.tasks;
CREATE TRIGGER trg_sync_task_done_progress
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_done_progress();
