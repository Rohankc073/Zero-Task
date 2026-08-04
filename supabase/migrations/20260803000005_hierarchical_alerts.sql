-- 1. Create a function to handle new user alerts based on role hierarchy
CREATE OR REPLACE FUNCTION public.handle_new_user_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  -- We only alert if they require approval
  IF NEW.is_approved = true THEN
    RETURN NEW;
  END IF;

  -- If Employee -> insert alert for Manager and Dept Head of their department
  IF NEW.role = 'Employee' AND NEW.department_id IS NOT NULL THEN
    -- Notify Managers
    FOR target_id IN
      SELECT id FROM public.users WHERE role = 'Manager' AND department_id = NEW.department_id
    LOOP
      INSERT INTO public.in_app_notifications (user_id, title, message, type)
      VALUES (target_id, 'New Approval Request', NEW.full_name || ' requested access as an Employee.', 'system');
    END LOOP;
    
    -- Notify Department Heads
    FOR target_id IN
      SELECT id FROM public.users WHERE role = 'Department Head' AND department_id = NEW.department_id
    LOOP
      INSERT INTO public.in_app_notifications (user_id, title, message, type)
      VALUES (target_id, 'New Approval Request', NEW.full_name || ' requested access as an Employee.', 'system');
    END LOOP;
  END IF;

  -- If Manager -> alert Dept Head and Founder
  IF NEW.role = 'Manager' AND NEW.department_id IS NOT NULL THEN
    -- Notify Department Heads
    FOR target_id IN
      SELECT id FROM public.users WHERE role = 'Department Head' AND department_id = NEW.department_id
    LOOP
      INSERT INTO public.in_app_notifications (user_id, title, message, type)
      VALUES (target_id, 'New Approval Request', NEW.full_name || ' requested access as a Manager.', 'system');
    END LOOP;
    
    -- Notify Founders
    FOR target_id IN
      SELECT id FROM public.users WHERE role = 'Founder'
    LOOP
      INSERT INTO public.in_app_notifications (user_id, title, message, type)
      VALUES (target_id, 'New Approval Request', NEW.full_name || ' requested access as a Manager.', 'system');
    END LOOP;
  END IF;

  -- If Department Head -> alert Founder
  IF NEW.role = 'Department Head' THEN
    -- Notify Founders
    FOR target_id IN
      SELECT id FROM public.users WHERE role = 'Founder'
    LOOP
      INSERT INTO public.in_app_notifications (user_id, title, message, type)
      VALUES (target_id, 'New Approval Request', NEW.full_name || ' requested access as a Department Head.', 'system');
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Create the trigger to run after insert on users table
DROP TRIGGER IF EXISTS on_new_user_alert ON public.users;
CREATE TRIGGER on_new_user_alert
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_alert();
