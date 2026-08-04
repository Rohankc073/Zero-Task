-- 1. Add role column to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'employee';

-- 2. get_employee_dashboard_metrics RPC
CREATE OR REPLACE FUNCTION get_employee_dashboard_metrics(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  open_tasks INT;
  due_this_week INT;
  done_this_month INT;
  total_this_month INT;
  completion_percentage FLOAT;
BEGIN
  -- Total open tasks
  SELECT COUNT(*) INTO open_tasks
  FROM tasks
  WHERE user_id = user_uuid AND status != 'Done';

  -- Tasks due this week
  SELECT COUNT(*) INTO due_this_week
  FROM tasks
  WHERE user_id = user_uuid 
    AND due_date >= date_trunc('week', now()) 
    AND due_date < date_trunc('week', now()) + interval '1 week'
    AND status != 'Done';

  -- Completion percentage for current month
  SELECT COUNT(*) INTO total_this_month
  FROM tasks
  WHERE user_id = user_uuid 
    AND created_at >= date_trunc('month', now());

  SELECT COUNT(*) INTO done_this_month
  FROM tasks
  WHERE user_id = user_uuid 
    AND status = 'Done'
    AND created_at >= date_trunc('month', now());

  IF total_this_month > 0 THEN
    completion_percentage := (done_this_month::FLOAT / total_this_month::FLOAT) * 100;
  ELSE
    completion_percentage := 0;
  END IF;

  result := json_build_object(
    'total_open_tasks', open_tasks,
    'tasks_due_this_week', due_this_week,
    'completion_percentage', round(completion_percentage::numeric, 1)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. get_manager_project_analytics RPC
CREATE OR REPLACE FUNCTION get_manager_project_analytics()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'project_id', p.id,
      'project_name', p.name,
      'total_tasks', p.total_tasks,
      'todo_tasks', p.todo_tasks,
      'in_progress_tasks', p.in_progress_tasks,
      'done_tasks', p.done_tasks
    )
  ) INTO result
  FROM (
    SELECT 
      pr.id, 
      pr.name,
      COUNT(t.id) as total_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'To Do') as todo_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'In Progress') as in_progress_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'Done') as done_tasks
    FROM projects pr
    LEFT JOIN tasks t ON t.project_id = pr.id
    WHERE pr.status = 'Active'
    GROUP BY pr.id, pr.name
  ) p;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. get_team_workload RPC
CREATE OR REPLACE FUNCTION get_team_workload()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'user_id', u.id,
      'user_name', COALESCE(u.name, split_part(u.email, '@', 1)),
      'assigned_tasks', u.assigned_tasks
    )
  ) INTO result
  FROM (
    SELECT 
      usr.id,
      usr.name,
      usr.email,
      COUNT(t.id) as assigned_tasks
    FROM public.users usr
    LEFT JOIN tasks t ON t.user_id = usr.id AND t.status != 'Done'
    GROUP BY usr.id, usr.name, usr.email
    ORDER BY assigned_tasks DESC
  ) u;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
