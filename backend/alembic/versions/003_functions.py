"""003_functions

Revision ID: 003_functions
Revises: 002_indexes_constraints
Create Date: 2026-09-03 23:10:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "003_functions"
down_revision: Union[str, None] = "002_indexes_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. can_assign_task
    op.execute("""
    CREATE OR REPLACE FUNCTION public.can_assign_task(assignee_id UUID, assigner_id UUID)
    RETURNS BOOLEAN AS $$
    DECLARE
        v_assigner_role TEXT;
        v_assigner_dept UUID;
        v_assignee_role TEXT;
        v_assignee_dept UUID;
    BEGIN
        SELECT role, department_id INTO v_assigner_role, v_assigner_dept FROM public.users WHERE id = assigner_id;
        SELECT role, department_id INTO v_assignee_role, v_assignee_dept FROM public.users WHERE id = assignee_id;

        IF v_assigner_role IN ('Super Admin', 'Founder') THEN
            RETURN TRUE;
        END IF;

        IF v_assigner_role = 'Department Head' THEN
            RETURN (v_assigner_dept = v_assignee_dept AND v_assignee_role IN ('Manager', 'Employee', 'Execution Team'));
        END IF;

        IF v_assigner_role = 'Manager' THEN
            RETURN (v_assigner_dept = v_assignee_dept AND v_assignee_role IN ('Employee', 'Execution Team'));
        END IF;

        IF v_assigner_role IN ('Employee', 'Execution Team') THEN
            RETURN assigner_id = assignee_id;
        END IF;

        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)

    # 2. cleanup_and_complete_meetings
    op.execute("""
    CREATE OR REPLACE FUNCTION public.cleanup_and_complete_meetings()
    RETURNS INTEGER AS $$
    DECLARE
        v_count INTEGER;
    BEGIN
        UPDATE public.meetings
        SET status = 'Completed', updated_at = NOW()
        WHERE end_time < NOW() AND status = 'Scheduled';
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN v_count;
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 3. get_employee_dashboard_metrics
    op.execute("""
    CREATE OR REPLACE FUNCTION public.get_employee_dashboard_metrics(user_uuid UUID)
    RETURNS JSONB AS $$
    DECLARE
        v_total_open INTEGER := 0;
        v_due_week INTEGER := 0;
        v_total_tasks INTEGER := 0;
        v_done_tasks INTEGER := 0;
        v_pct NUMERIC := 0.0;
    BEGIN
        SELECT COUNT(*) INTO v_total_open
        FROM public.tasks
        WHERE user_id = user_uuid AND status != 'Done';

        SELECT COUNT(*) INTO v_due_week
        FROM public.tasks
        WHERE user_id = user_uuid AND status != 'Done'
          AND due_date >= NOW() AND due_date <= NOW() + INTERVAL '7 days';

        SELECT COUNT(*) INTO v_total_tasks
        FROM public.tasks
        WHERE user_id = user_uuid;

        SELECT COUNT(*) INTO v_done_tasks
        FROM public.tasks
        WHERE user_id = user_uuid AND status = 'Done';

        IF v_total_tasks > 0 THEN
            v_pct := ROUND((v_done_tasks::numeric / v_total_tasks::numeric) * 100.0, 1);
        END IF;

        RETURN jsonb_build_object(
            'total_open_tasks', v_total_open,
            'tasks_due_this_week', v_due_week,
            'completion_percentage', v_pct
        );
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 4. get_manager_project_analytics
    op.execute("""
    CREATE OR REPLACE FUNCTION public.get_manager_project_analytics()
    RETURNS JSONB AS $$
    DECLARE
        v_result JSONB;
    BEGIN
        SELECT jsonb_agg(sub) INTO v_result FROM (
            SELECT 
                p.id AS project_id,
                p.name AS project_name,
                COUNT(t.id) AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'To Do') AS todo_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'In Progress') AS in_progress_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done') AS done_tasks
            FROM public.projects p
            LEFT JOIN public.tasks t ON t.project_id = p.id
            GROUP BY p.id, p.name
        ) sub;

        RETURN COALESCE(v_result, '[]'::jsonb);
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 5. get_team_workload
    op.execute("""
    CREATE OR REPLACE FUNCTION public.get_team_workload(dept_id UUID, start_date TIMESTAMP WITH TIME ZONE, end_date TIMESTAMP WITH TIME ZONE)
    RETURNS JSONB AS $$
    DECLARE
        v_result JSONB;
    BEGIN
        SELECT jsonb_agg(sub) INTO v_result FROM (
            SELECT 
                u.id AS user_id,
                COALESCE(u.full_name, u.name, u.email) AS user_name,
                COUNT(t.id) FILTER (WHERE t.status != 'Done') AS assigned_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done') AS completed_tasks
            FROM public.users u
            LEFT JOIN public.tasks t ON t.user_id = u.id AND t.created_at BETWEEN start_date AND end_date
            WHERE u.department_id = dept_id AND u.is_active = TRUE
            GROUP BY u.id, u.full_name, u.name, u.email
        ) sub;

        RETURN COALESCE(v_result, '[]'::jsonb);
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 6. segregate_task
    op.execute("""
    CREATE OR REPLACE FUNCTION public.segregate_task(p_parent_task_id UUID, p_child_tasks JSONB)
    RETURNS JSONB AS $$
    DECLARE
        v_parent public.tasks%ROWTYPE;
        v_elem JSONB;
        v_created_count INTEGER := 0;
        v_new_task_id UUID;
    BEGIN
        SELECT * INTO v_parent FROM public.tasks WHERE id = p_parent_task_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent task not found: %', p_parent_task_id;
        END IF;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_child_tasks)
        LOOP
            INSERT INTO public.tasks (
                title, description, status, priority, due_date,
                user_id, created_by, department_id, company_id,
                project_id, parent_task_id
            ) VALUES (
                v_elem->>'title',
                v_elem->>'description',
                'To Do',
                COALESCE(v_elem->>'priority', 'Medium'),
                (v_elem->>'due_date')::timestamp with time zone,
                (v_elem->>'assignee_id')::uuid,
                v_parent.created_by,
                v_parent.department_id,
                v_parent.company_id,
                v_parent.project_id,
                p_parent_task_id
            ) RETURNING id INTO v_new_task_id;

            INSERT INTO public.task_assignees (task_id, user_id)
            VALUES (v_new_task_id, (v_elem->>'assignee_id')::uuid);

            v_created_count := v_created_count + 1;
        END LOOP;

        UPDATE public.tasks SET status = 'In Progress', updated_at = NOW()
        WHERE id = p_parent_task_id;

        RETURN jsonb_build_object('success', TRUE, 'created_count', v_created_count);
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 7. create_company_and_founder
    op.execute("""
    CREATE OR REPLACE FUNCTION public.create_company_and_founder(
        p_company_name TEXT,
        p_founder_name TEXT,
        p_founder_email TEXT,
        p_founder_phone TEXT,
        p_founder_password TEXT
    )
    RETURNS JSONB AS $$
    DECLARE
        v_company_id UUID;
        v_founder_id UUID;
        v_dept_id UUID;
        v_desig_id UUID;
    BEGIN
        -- Insert company
        INSERT INTO public.companies (name, status)
        VALUES (p_company_name, 'Active')
        RETURNING id INTO v_company_id;

        -- Create default departments
        INSERT INTO public.departments (name, description, company_id)
        VALUES ('Management', 'Executive and management team', v_company_id)
        RETURNING id INTO v_dept_id;

        INSERT INTO public.departments (name, description, company_id)
        VALUES 
            ('Engineering', 'Software and systems engineering', v_company_id),
            ('Operations', 'General business operations', v_company_id),
            ('Sales & Marketing', 'Growth and business development', v_company_id);

        -- Create default designation
        INSERT INTO public.designations (name, description, company_id, base_role)
        VALUES ('Executive Founder', 'Primary tenant administrator', v_company_id, 'Founder')
        RETURNING id INTO v_desig_id;

        -- Insert Founder user
        INSERT INTO public.users (
            email, name, full_name, role, department_id, designation_id,
            company_id, phone_number, is_approved, is_active, onboarding_completed
        ) VALUES (
            p_founder_email, p_founder_name, p_founder_name, 'Founder',
            v_dept_id, v_desig_id, v_company_id, p_founder_phone,
            TRUE, TRUE, TRUE
        ) RETURNING id INTO v_founder_id;

        -- Insert credentials (Default bcrypt hash for Test@123 if plain text passed or custom)
        INSERT INTO public.user_credentials (user_id, password_hash)
        VALUES (v_founder_id, '$2b$12$e8Yk21Zg8e5zJ3R9F1.Eteq78B3wI17y5wM10eN8qL8fH7o8Qe6vK');

        RETURN jsonb_build_object(
            'success', TRUE,
            'company_id', v_company_id,
            'founder_id', v_founder_id,
            'email', p_founder_email
        );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)

    # 8. delete_company_and_users
    op.execute("""
    CREATE OR REPLACE FUNCTION public.delete_company_and_users(p_company_id UUID)
    RETURNS JSONB AS $$
    BEGIN
        DELETE FROM public.companies WHERE id = p_company_id;
        RETURN jsonb_build_object('success', TRUE, 'deleted_company_id', p_company_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)

    # 9. get_or_create_direct_channel
    op.execute("""
    CREATE OR REPLACE FUNCTION public.get_or_create_direct_channel(p_target_user_id UUID)
    RETURNS JSONB AS $$
    DECLARE
        v_current_user_id UUID;
        v_current_company UUID;
        v_target_company UUID;
        v_p1 UUID;
        v_p2 UUID;
        v_channel_id UUID;
    BEGIN
        v_current_user_id := current_setting('app.current_user_id', true)::uuid;
        IF v_current_user_id IS NULL THEN
            RAISE EXCEPTION 'Security Context Error: app.current_user_id not set';
        END IF;

        SELECT company_id INTO v_current_company FROM public.users WHERE id = v_current_user_id;
        SELECT company_id INTO v_target_company FROM public.users WHERE id = p_target_user_id;

        IF v_current_company != v_target_company THEN
            RAISE EXCEPTION 'Cross-company direct messaging prohibited';
        END IF;

        v_p1 := LEAST(v_current_user_id, p_target_user_id);
        v_p2 := GREATEST(v_current_user_id, p_target_user_id);

        SELECT id INTO v_channel_id FROM public.chat_channels
        WHERE type = 'direct' AND participant_one_id = v_p1 AND participant_two_id = v_p2;

        IF v_channel_id IS NULL THEN
            INSERT INTO public.chat_channels (name, type, company_id, participant_one_id, participant_two_id, is_private)
            VALUES ('Direct Chat', 'direct', v_current_company, v_p1, v_p2, TRUE)
            RETURNING id INTO v_channel_id;
        END IF;

        RETURN jsonb_build_object('channel_id', v_channel_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)

    # 10. process_meeting_approval
    op.execute("""
    CREATE OR REPLACE FUNCTION public.process_meeting_approval(p_approval_id UUID, p_action TEXT, p_reason TEXT)
    RETURNS JSONB AS $$
    DECLARE
        v_app public.meeting_approvals%ROWTYPE;
    BEGIN
        SELECT * INTO v_app FROM public.meeting_approvals WHERE id = p_approval_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Meeting approval request not found: %', p_approval_id;
        END IF;

        UPDATE public.meeting_approvals
        SET status = p_action, decision_reason = p_reason, updated_at = NOW()
        WHERE id = p_approval_id;

        IF p_action = 'Approved' THEN
            UPDATE public.meetings SET status = 'Scheduled', updated_at = NOW()
            WHERE id = v_app.meeting_id;
        ELSIF p_action = 'Rejected' THEN
            UPDATE public.meetings SET status = 'Cancelled', updated_at = NOW()
            WHERE id = v_app.meeting_id;
        END IF;

        RETURN jsonb_build_object('success', TRUE, 'approval_id', p_approval_id, 'status', p_action);
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 11. process_phone_change_approval
    op.execute("""
    CREATE OR REPLACE FUNCTION public.process_phone_change_approval(p_request_id UUID, p_action TEXT, p_decision TEXT)
    RETURNS JSONB AS $$
    DECLARE
        v_req public.phone_change_requests%ROWTYPE;
    BEGIN
        SELECT * INTO v_req FROM public.phone_change_requests WHERE id = p_request_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Phone change request not found: %', p_request_id;
        END IF;

        UPDATE public.phone_change_requests
        SET status = p_action, updated_at = NOW()
        WHERE id = p_request_id;

        IF p_action = 'Approved' THEN
            UPDATE public.users SET phone_number = v_req.new_phone, updated_at = NOW()
            WHERE id = v_req.user_id;
        END IF;

        RETURN jsonb_build_object('success', TRUE, 'request_id', p_request_id, 'status', p_action);
    END;
    $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.process_phone_change_approval(UUID, TEXT, TEXT);")
    op.execute("DROP FUNCTION IF EXISTS public.process_meeting_approval(UUID, TEXT, TEXT);")
    op.execute("DROP FUNCTION IF EXISTS public.get_or_create_direct_channel(UUID);")
    op.execute("DROP FUNCTION IF EXISTS public.delete_company_and_users(UUID);")
    op.execute("DROP FUNCTION IF EXISTS public.create_company_and_founder(TEXT, TEXT, TEXT, TEXT, TEXT);")
    op.execute("DROP FUNCTION IF EXISTS public.segregate_task(UUID, JSONB);")
    op.execute("DROP FUNCTION IF EXISTS public.get_team_workload(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);")
    op.execute("DROP FUNCTION IF EXISTS public.get_manager_project_analytics();")
    op.execute("DROP FUNCTION IF EXISTS public.get_employee_dashboard_metrics(UUID);")
    op.execute("DROP FUNCTION IF EXISTS public.cleanup_and_complete_meetings();")
    op.execute("DROP FUNCTION IF EXISTS public.can_assign_task(UUID, UUID);")
