"""006_realtime_events

Revision ID: 006_realtime_events
Revises: 005_authorization_rls
Create Date: 2026-09-03 23:25:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "006_realtime_events"
down_revision: Union[str, None] = "005_authorization_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Realtime notification trigger function
    op.execute("""
    CREATE OR REPLACE FUNCTION public.fn_notify_app_events()
    RETURNS TRIGGER AS $$
    DECLARE
        v_payload JSONB;
        v_company_id UUID := NULL;
    BEGIN
        IF TG_TABLE_NAME IN ('tasks', 'meetings', 'chat_channels', 'audit_logs') THEN
            v_company_id := COALESCE(NEW.company_id, OLD.company_id);
        ELSIF TG_TABLE_NAME = 'chat_messages' THEN
            SELECT company_id INTO v_company_id FROM public.chat_channels WHERE id = COALESCE(NEW.channel_id, OLD.channel_id);
        ELSIF TG_TABLE_NAME = 'in_app_notifications' THEN
            SELECT company_id INTO v_company_id FROM public.users WHERE id = COALESCE(NEW.user_id, OLD.user_id);
        END IF;

        v_payload := jsonb_build_object(
            'table', TG_TABLE_NAME,
            'action', TG_OP,
            'company_id', v_company_id,
            'record', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
        );

        PERFORM pg_notify('app_events', v_payload::text);
        RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
    """)

    # 2. Attach triggers to core tables
    tables = ["tasks", "meetings", "chat_messages", "in_app_notifications", "audit_logs"]
    for table in tables:
        op.execute(f"""
        DROP TRIGGER IF EXISTS trg_notify_app_events_{table} ON public.{table};
        CREATE TRIGGER trg_notify_app_events_{table}
        AFTER INSERT OR UPDATE OR DELETE ON public.{table}
        FOR EACH ROW EXECUTE FUNCTION public.fn_notify_app_events();
        """)


def downgrade() -> None:
    tables = ["tasks", "meetings", "chat_messages", "in_app_notifications", "audit_logs"]
    for table in tables:
        op.execute(f"DROP TRIGGER IF EXISTS trg_notify_app_events_{table} ON public.{table};")
    op.execute("DROP FUNCTION IF EXISTS public.fn_notify_app_events();")
