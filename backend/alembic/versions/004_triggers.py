"""004_triggers

Revision ID: 004_triggers
Revises: 003_functions
Create Date: 2026-09-03 23:15:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "004_triggers"
down_revision: Union[str, None] = "003_functions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Company Auto-Assignment Trigger on tasks
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_tasks_set_company_id()
    RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.company_id IS NULL AND NEW.created_by IS NOT NULL THEN
            SELECT company_id INTO NEW.company_id FROM public.users WHERE id = NEW.created_by;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_tasks_set_company_id ON public.tasks;
    CREATE TRIGGER trg_tasks_set_company_id
    BEFORE INSERT ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.fn_tasks_set_company_id();
    """)

    # 2. Assignee Company Validation Trigger
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

    DROP TRIGGER IF EXISTS trg_task_assignees_check_company ON public.task_assignees;
    CREATE TRIGGER trg_task_assignees_check_company
    BEFORE INSERT ON public.task_assignees
    FOR EACH ROW EXECUTE FUNCTION public.fn_task_assignees_check_company();
    """)

    # 3. Auto-sync progress to 100 on Done
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_sync_task_done_progress()
    RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.status = 'Done' AND (OLD.status IS DISTINCT FROM 'Done' OR NEW.progress < 100) THEN
            NEW.progress := 100;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sync_task_done_progress ON public.tasks;
    CREATE TRIGGER trg_sync_task_done_progress
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_task_done_progress();
    """)

    # 4. Enforce Completed Task Protection
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_enforce_completed_task()
    RETURNS TRIGGER AS $$
    BEGIN
        IF OLD.status = 'Done' AND NEW.status = 'Done' THEN
            IF NEW.title IS DISTINCT FROM OLD.title OR
               NEW.description IS DISTINCT FROM OLD.description OR
               NEW.due_date IS DISTINCT FROM OLD.due_date OR
               NEW.priority IS DISTINCT FROM OLD.priority THEN
                RAISE EXCEPTION 'Completed tasks cannot be modified without reopening first';
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_enforce_completed_task ON public.tasks;
    CREATE TRIGGER trg_enforce_completed_task
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_completed_task();
    """)

    # 5. Audit Logging Trigger on Tasks
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
            INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, new_state)
            VALUES (v_company, v_user, NEW.id, 'TASK_CREATED', 'task', NEW.id, 'Task created: ' || NEW.title, row_to_json(NEW));
            RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
            INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, previous_state, new_state)
            VALUES (v_company, v_user, NEW.id, 'TASK_UPDATED', 'task', NEW.id, 'Task updated: ' || NEW.title, row_to_json(OLD), row_to_json(NEW));
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            INSERT INTO public.audit_logs (company_id, user_id, task_id, action_type, target_type, target_id, description, previous_state)
            VALUES (v_company, v_user, NULL, 'TASK_DELETED', 'task', OLD.id, 'Task deleted: ' || OLD.title, row_to_json(OLD));
            RETURN OLD;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tasks_audit_trigger ON public.tasks;
    CREATE TRIGGER tasks_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.fn_tasks_audit_log();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tasks_audit_trigger ON public.tasks;")
    op.execute("DROP FUNCTION IF EXISTS public.fn_tasks_audit_log();")

    op.execute("DROP TRIGGER IF EXISTS trg_enforce_completed_task ON public.tasks;")
    op.execute("DROP FUNCTION IF EXISTS public.fn_enforce_completed_task();")

    op.execute("DROP TRIGGER IF EXISTS trg_sync_task_done_progress ON public.tasks;")
    op.execute("DROP FUNCTION IF EXISTS public.fn_sync_task_done_progress();")

    op.execute("DROP TRIGGER IF EXISTS trg_task_assignees_check_company ON public.task_assignees;")
    op.execute("DROP FUNCTION IF EXISTS public.fn_task_assignees_check_company();")

    op.execute("DROP TRIGGER IF EXISTS trg_tasks_set_company_id ON public.tasks;")
    op.execute("DROP FUNCTION IF EXISTS public.fn_tasks_set_company_id();")
