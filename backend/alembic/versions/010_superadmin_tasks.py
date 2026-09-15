"""010_superadmin_tasks

Revision ID: 010_superadmin_tasks
Revises: 009_notification_action_url
Create Date: 2026-09-13 13:50:00.000000

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '010_superadmin_tasks'
down_revision: Union[str, None] = '009_notification_action_url'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Update assignee company validation trigger to allow Super Admin cross-company task assignments
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_task_assignees_check_company()
    RETURNS TRIGGER AS $$
    DECLARE
        v_task_company UUID;
        v_user_company UUID;
        v_creator_role VARCHAR;
    BEGIN
        SELECT t.company_id, u.role INTO v_task_company, v_creator_role 
        FROM public.tasks t 
        LEFT JOIN public.users u ON t.created_by = u.id 
        WHERE t.id = NEW.task_id;

        -- Super Admin has universal cross-company assignment authority
        IF v_creator_role = 'Super Admin' THEN
            RETURN NEW;
        END IF;

        -- Global cross-company task (company_id IS NULL) allows multi-company assignees
        IF v_task_company IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT company_id INTO v_user_company FROM public.users WHERE id = NEW.user_id;

        IF v_user_company IS NOT NULL AND v_task_company != v_user_company THEN
            RAISE EXCEPTION 'Assignee belongs to a different company than the task';
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_task_assignees_check_company()
    RETURNS TRIGGER AS $$
    DECLARE
        v_task_company UUID;
        v_user_company UUID;
    BEGIN
        SELECT company_id INTO v_task_company FROM public.tasks WHERE id = NEW.task_id;
        SELECT company_id INTO v_user_company FROM public.users WHERE id = NEW.user_id;

        IF v_task_company IS NOT NULL AND v_user_company IS NOT NULL AND v_task_company != v_user_company THEN
            RAISE EXCEPTION 'Assignee belongs to a different company than the task';
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """)
