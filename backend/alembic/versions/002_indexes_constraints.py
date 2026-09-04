"""002_indexes_constraints

Revision ID: 002_indexes_constraints
Revises: 001_initial_schema
Create Date: 2026-09-03 23:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002_indexes_constraints"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Composite & Performance Indexes
    op.create_index("idx_tasks_company_dept_status", "tasks", ["company_id", "department_id", "status"])
    op.create_index("idx_tasks_user_status", "tasks", ["user_id", "status"])
    op.create_index("idx_chat_messages_channel_created", "chat_messages", ["channel_id", "created_at"])
    op.create_index("idx_audit_logs_company_created", "audit_logs", ["company_id", "created_at"])
    op.create_index("idx_meetings_company_time", "meetings", ["company_id", "start_time"])
    op.create_index("idx_in_app_notifs_user_read", "in_app_notifications", ["user_id", "is_read"])

    # 2. Check Constraints
    op.create_check_constraint(
        "ck_tasks_progress_range",
        "tasks",
        "progress >= 0 AND progress <= 100"
    )
    op.create_check_constraint(
        "ck_tasks_priority_valid",
        "tasks",
        "priority IN ('Low', 'Medium', 'High')"
    )
    op.create_check_constraint(
        "ck_tasks_status_valid",
        "tasks",
        "status IN ('To Do', 'In Progress', 'Awaiting Review', 'Done')"
    )
    op.create_check_constraint(
        "ck_users_role_valid",
        "users",
        "role IN ('Super Admin', 'Founder', 'Department Head', 'Manager', 'Employee', 'Execution Team')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role_valid", "users", type_="check")
    op.drop_constraint("ck_tasks_status_valid", "tasks", type_="check")
    op.drop_constraint("ck_tasks_priority_valid", "tasks", type_="check")
    op.drop_constraint("ck_tasks_progress_range", "tasks", type_="check")

    op.drop_index("idx_in_app_notifs_user_read", "in_app_notifications")
    op.drop_index("idx_meetings_company_time", "meetings")
    op.drop_index("idx_audit_logs_company_created", "audit_logs")
    op.drop_index("idx_chat_messages_channel_created", "chat_messages")
    op.drop_index("idx_tasks_user_status", "tasks")
    op.drop_index("idx_tasks_company_dept_status", "tasks")
