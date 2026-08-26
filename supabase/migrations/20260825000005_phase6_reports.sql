-- Phase 6: Reports + PDF Generation

-- 1. Create a function to get department performance
CREATE OR REPLACE FUNCTION public.get_department_performance(start_date TIMESTAMP, end_date TIMESTAMP)
RETURNS TABLE (
    department_id UUID,
    department_name TEXT,
    total_tasks BIGINT,
    completed_tasks BIGINT,
    completion_rate NUMERIC,
    missed_deadlines BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as department_id,
        d.name as department_name,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'Done' THEN 1 END) as completed_tasks,
        ROUND((COUNT(CASE WHEN t.status = 'Done' THEN 1 END) * 100.0) / NULLIF(COUNT(t.id), 0), 2) as completion_rate,
        COUNT(CASE WHEN t.due_date < NOW() AND t.status != 'Done' THEN 1 END) as missed_deadlines
    FROM public.departments d
    LEFT JOIN public.tasks t ON t.department_id = d.id AND t.created_at BETWEEN start_date AND end_date
    GROUP BY d.id, d.name
    ORDER BY completion_rate DESC NULLS LAST;
END;
$$;

-- 2. Create a function to get team workload
CREATE OR REPLACE FUNCTION public.get_team_workload(dept_id UUID, start_date TIMESTAMP, end_date TIMESTAMP)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    active_tasks BIGINT,
    completed_tasks BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.full_name,
        COUNT(CASE WHEN t.status != 'Done' THEN 1 END) as active_tasks,
        COUNT(CASE WHEN t.status = 'Done' THEN 1 END) as completed_tasks
    FROM public.users u
    LEFT JOIN public.task_assignees ta ON ta.user_id = u.id
    LEFT JOIN public.tasks t ON t.id = ta.task_id AND t.created_at BETWEEN start_date AND end_date
    WHERE (dept_id IS NULL OR u.department_id = dept_id)
    GROUP BY u.id, u.full_name
    ORDER BY active_tasks DESC;
END;
$$;
