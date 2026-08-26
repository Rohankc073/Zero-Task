-- Migration: 20260825000011_founder_unlimited_deadline_updates.sql
-- Description: Allows Founders to update deadlines as many times as they want on all tasks.

BEGIN;

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

        -- 1. Founder can ALWAYS change any deadline as many times as they want
        IF v_updater_role = 'Founder' THEN
            NEW.deadline_last_modified_by := auth.uid();
            RETURN NEW;
        END IF;

        -- 2. If non-founder creator is updating, they can only set it once (when OLD.due_date was NULL)
        IF auth.uid() = NEW.created_by THEN
            IF OLD.due_date IS NOT NULL THEN
                RAISE EXCEPTION 'Creator cannot modify the deadline once it is set.';
            END IF;
            NEW.initial_deadline_set := true;
            NEW.deadline_last_modified_by := auth.uid();
            RETURN NEW;
        END IF;

        -- 3. Superior checking for non-creators
        -- Department Head can change Manager or Employee deadlines
        IF v_updater_role = 'Department Head' AND v_creator_role IN ('Manager', 'Employee') THEN
            NEW.deadline_last_modified_by := auth.uid();
            RETURN NEW;
        END IF;
        
        -- Manager can change Employee deadlines
        IF v_updater_role = 'Manager' AND v_creator_role = 'Employee' THEN
            NEW.deadline_last_modified_by := auth.uid();
            RETURN NEW;
        END IF;

        -- Otherwise, unauthorized
        RAISE EXCEPTION 'You do not have permission to modify this deadline based on organizational hierarchy.';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
