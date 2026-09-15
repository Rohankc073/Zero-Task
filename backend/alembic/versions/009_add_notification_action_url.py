"""009_add_notification_action_url

Revision ID: 009_notification_action_url
Revises: 008_fix_company_cascade
Create Date: 2026-09-10 08:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '009_notification_action_url'
down_revision: Union[str, None] = '008_fix_company_cascade'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add action_url column to in_app_notifications for persisting notification tap targets
    op.add_column(
        'in_app_notifications',
        sa.Column('action_url', sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('in_app_notifications', 'action_url')
