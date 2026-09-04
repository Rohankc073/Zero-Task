"""005_authorization_rls

Revision ID: 005_authorization_rls
Revises: 004_triggers
Create Date: 2026-09-03 23:20:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "005_authorization_rls"
down_revision: Union[str, None] = "004_triggers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = [
        "companies", "users", "departments", "designations",
        "tasks", "meetings", "chat_channels", "chat_messages", "audit_logs"
    ]

    for table in tables:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;")

        if table == "companies":
            cond = """(
                current_setting('app.current_user_role', true) = 'Super Admin'
                OR current_setting('app.current_company_id', true) IS NULL
                OR id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
                OR (SELECT company_id FROM public.users WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::uuid) = id
            )"""
        elif table == "chat_messages":
            cond = """(
                current_setting('app.current_user_role', true) = 'Super Admin'
                OR current_setting('app.current_company_id', true) IS NULL
                OR channel_id IN (
                    SELECT id FROM public.chat_channels
                    WHERE company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
                )
                OR channel_id IN (
                    SELECT cc.id FROM public.chat_channels cc
                    JOIN public.users u ON u.company_id = cc.company_id
                    WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )"""
        else:
            cond = f"""(
                current_setting('app.current_user_role', true) = 'Super Admin'
                OR current_setting('app.current_company_id', true) IS NULL
                OR company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
                OR (SELECT company_id FROM public.users WHERE id = NULLIF(current_setting('app.current_user_id', true), '')::uuid) = company_id
            )"""

        # Policy allowing Super Admin or queries matching current company
        op.execute(f"""
        DROP POLICY IF EXISTS p_company_isolation_{table} ON public.{table};
        CREATE POLICY p_company_isolation_{table} ON public.{table}
        AS PERMISSIVE
        FOR ALL
        USING {cond};
        """)


def downgrade() -> None:
    tables = [
        "companies", "users", "departments", "designations",
        "tasks", "meetings", "chat_channels", "chat_messages", "audit_logs"
    ]
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS p_company_isolation_{table} ON public.{table};")
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
