"""007_hierarchical_password_resets

Revision ID: 007_hierarchical_password_resets
Revises: 006_realtime_events
Create Date: 2026-09-09 23:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "007_hierarchical_password_resets"
down_revision: Union[str, None] = "006_realtime_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new fields to password_resets for hierarchical recovery workflow
    op.add_column("password_resets", sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.add_column("password_resets", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("password_resets", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("password_resets", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("password_resets", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))

    # Add indexes for efficient querying and isolation
    op.create_index("ix_password_resets_company_id", "password_resets", ["company_id"])
    op.create_index("ix_password_resets_status", "password_resets", ["status"])
    op.create_index("ix_password_resets_status_company", "password_resets", ["status", "company_id"])


def downgrade() -> None:
    op.drop_index("ix_password_resets_status_company", table_name="password_resets")
    op.drop_index("ix_password_resets_status", table_name="password_resets")
    op.drop_index("ix_password_resets_company_id", table_name="password_resets")

    op.drop_column("password_resets", "expires_at")
    op.drop_column("password_resets", "completed_at")
    op.drop_column("password_resets", "approved_at")
    op.drop_column("password_resets", "rejection_reason")
    op.drop_column("password_resets", "company_id")
