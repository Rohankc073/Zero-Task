"""008_fix_company_cascade_and_triggers

Revision ID: 008_fix_company_cascade
Revises: 007_hierarchical_password_resets
Create Date: 2026-09-10 01:30:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "008_fix_company_cascade"
down_revision: Union[str, None] = "007_hierarchical_password_resets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update tasks audit log trigger function to avoid foreign key violations during cascading deletes
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_tasks_audit_log()
    RETURNS TRIGGER AS $$
    DECLARE
        v_user UUID;
        v_company UUID;
    BEGIN
        v_user := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
        v_company := COALESCE(NEW.company_id, OLD.company_id);

        IF TG_OP = 'INSERT' THEN
            IF v_company IS NOT NULL AND EXISTS (SELECT 1 FROM public.companies WHERE id = v_company) THEN
                INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, new_state)
                VALUES (v_company, v_user, NEW.id, 'TASK_CREATED', 'task', NEW.id, 'Task created: ' || NEW.title, row_to_json(NEW));
            END IF;
            RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
            IF v_company IS NOT NULL AND EXISTS (SELECT 1 FROM public.companies WHERE id = v_company) THEN
                INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, previous_state, new_state)
                VALUES (v_company, v_user, NEW.id, 'TASK_UPDATED', 'task', NEW.id, 'Task updated: ' || NEW.title, row_to_json(OLD), row_to_json(NEW));
            END IF;
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            IF v_company IS NOT NULL AND EXISTS (SELECT 1 FROM public.companies WHERE id = v_company) THEN
                INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, previous_state)
                VALUES (v_company, v_user, NULL, 'TASK_DELETED', 'task', OLD.id, 'Task deleted: ' || OLD.title, row_to_json(OLD));
            END IF;
            RETURN OLD;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 2. Update delete_company_and_users stored function to thoroughly clean all tenant artifacts
    op.execute("""
    CREATE OR REPLACE FUNCTION public.delete_company_and_users(p_company_id UUID)
    RETURNS JSONB AS $$
    DECLARE
        v_user_ids UUID[];
        v_task_ids UUID[];
        v_meeting_ids UUID[];
        v_channel_ids UUID[];
        v_project_ids UUID[];
    BEGIN
        -- Detach any Super Admin from this company to guarantee preservation
        UPDATE public.users 
        SET company_id = NULL, department_id = NULL, designation_id = NULL 
        WHERE role = 'Super Admin' AND company_id = p_company_id;

        -- Collect all tenant user IDs (excluding Super Admin)
        SELECT ARRAY_AGG(id) INTO v_user_ids 
        FROM public.users 
        WHERE company_id = p_company_id AND role != 'Super Admin';

        -- Collect related entity IDs
        SELECT ARRAY_AGG(id) INTO v_task_ids FROM public.tasks WHERE company_id = p_company_id;
        SELECT ARRAY_AGG(id) INTO v_meeting_ids FROM public.meetings WHERE company_id = p_company_id;
        SELECT ARRAY_AGG(id) INTO v_channel_ids FROM public.chat_channels WHERE company_id = p_company_id;
        SELECT ARRAY_AGG(id) INTO v_project_ids FROM public.projects WHERE company_id = p_company_id;

        -- 1. Tasks and Task Children
        IF v_task_ids IS NOT NULL AND array_length(v_task_ids, 1) > 0 THEN
            DELETE FROM public.task_voice_notes WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.task_files WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.task_attachments WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.task_assignees WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.comments WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.activity_comments WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.execution_activity WHERE task_id = ANY(v_task_ids);
            DELETE FROM public.approvals WHERE task_id = ANY(v_task_ids);
        END IF;

        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.task_voice_notes WHERE creator_id = ANY(v_user_ids);
            DELETE FROM public.task_files WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.task_attachments WHERE uploaded_by = ANY(v_user_ids);
            DELETE FROM public.task_assignees WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.task_milestones WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.comments WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.activity_comments WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.execution_activity WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.approvals WHERE requester_id = ANY(v_user_ids) OR approver_id = ANY(v_user_ids);
        END IF;

        DELETE FROM public.tasks WHERE company_id = p_company_id;
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.tasks WHERE created_by = ANY(v_user_ids) OR user_id = ANY(v_user_ids);
        END IF;

        -- 2. Chat Channels and Messages
        IF v_channel_ids IS NOT NULL AND array_length(v_channel_ids, 1) > 0 THEN
            DELETE FROM public.chat_messages WHERE channel_id = ANY(v_channel_ids);
        END IF;
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.chat_messages WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.chat_channels WHERE participant_one_id = ANY(v_user_ids) OR participant_two_id = ANY(v_user_ids);
        END IF;
        DELETE FROM public.chat_channels WHERE company_id = p_company_id;

        -- 3. Meetings and Meeting Children
        IF v_meeting_ids IS NOT NULL AND array_length(v_meeting_ids, 1) > 0 THEN
            DELETE FROM public.meeting_files WHERE meeting_id = ANY(v_meeting_ids);
            DELETE FROM public.meeting_attachments WHERE meeting_id = ANY(v_meeting_ids);
            DELETE FROM public.meeting_participants WHERE meeting_id = ANY(v_meeting_ids);
            DELETE FROM public.meeting_approvals WHERE meeting_id = ANY(v_meeting_ids);
        END IF;

        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.meeting_files WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.meeting_attachments WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.meeting_participants WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.meeting_approvals WHERE approver_id = ANY(v_user_ids) OR requester_id = ANY(v_user_ids);
            DELETE FROM public.meeting_requests WHERE requester_id = ANY(v_user_ids);
        END IF;

        DELETE FROM public.meetings WHERE company_id = p_company_id;
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.meetings WHERE organizer_id = ANY(v_user_ids);
        END IF;

        -- 4. Projects and Milestones
        IF v_project_ids IS NOT NULL AND array_length(v_project_ids, 1) > 0 THEN
            DELETE FROM public.project_milestones WHERE project_id = ANY(v_project_ids);
            DELETE FROM public.project_members WHERE project_id = ANY(v_project_ids);
        END IF;
        DELETE FROM public.department_milestones WHERE company_id = p_company_id;
        DELETE FROM public.projects WHERE company_id = p_company_id;

        -- 5. Notifications and Approvals
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.notifications WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.in_app_notifications WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.phone_change_requests WHERE user_id = ANY(v_user_ids) OR approved_by = ANY(v_user_ids);
            DELETE FROM public.password_resets WHERE requester_id = ANY(v_user_ids) OR approver_id = ANY(v_user_ids);
        END IF;
        DELETE FROM public.system_alerts WHERE department_id IN (SELECT id FROM public.departments WHERE company_id = p_company_id);

        -- 6. User Profiles, Credentials, Tokens & Notes
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.user_notes WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.user_integrations WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.user_push_tokens WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.user_refresh_tokens WHERE user_id = ANY(v_user_ids);
            DELETE FROM public.user_credentials WHERE user_id = ANY(v_user_ids);
        END IF;

        -- 7. Audit Logs for this company
        DELETE FROM public.audit_logs WHERE company_id = p_company_id;
        IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
            DELETE FROM public.audit_logs WHERE user_id = ANY(v_user_ids);
        END IF;

        -- 8. Users
        DELETE FROM public.users WHERE company_id = p_company_id AND role != 'Super Admin';

        -- 9. Org Structure
        DELETE FROM public.departments WHERE company_id = p_company_id;
        DELETE FROM public.designations WHERE company_id = p_company_id;

        -- 10. Company
        DELETE FROM public.companies WHERE id = p_company_id;

        RETURN jsonb_build_object(
            'success', TRUE, 
            'deleted_company_id', p_company_id,
            'deleted_users_count', COALESCE(array_length(v_user_ids, 1), 0)
        );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)


def downgrade() -> None:
    pass
