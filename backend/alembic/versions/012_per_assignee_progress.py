"""per_assignee_progress

Revision ID: 012_per_assignee_progress
Revises: 011_departments_and_designations_unique_index
Create Date: 2026-09-17 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '012_per_assignee_progress'
down_revision = '011_departments_unique'
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to task_assignees
    op.add_column('task_assignees', sa.Column('progress', sa.Integer(), server_default='0', nullable=False))
    op.add_column('task_assignees', sa.Column('status', sa.String(length=50), server_default='To Do', nullable=False))
    op.add_column('task_assignees', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))

    # Create task_assignment_progress_history table
    op.create_table(
        'task_assignment_progress_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('changed_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('previous_progress', sa.Integer(), nullable=False),
        sa.Column('new_progress', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_task_assignment_progress_history_task_id'), 'task_assignment_progress_history', ['task_id'], unique=False)
    op.create_index(op.f('ix_task_assignment_progress_history_user_id'), 'task_assignment_progress_history', ['user_id'], unique=False)

def downgrade():
    op.drop_index(op.f('ix_task_assignment_progress_history_user_id'), table_name='task_assignment_progress_history')
    op.drop_index(op.f('ix_task_assignment_progress_history_task_id'), table_name='task_assignment_progress_history')
    op.drop_table('task_assignment_progress_history')
    
    op.drop_column('task_assignees', 'completed_at')
    op.drop_column('task_assignees', 'status')
    op.drop_column('task_assignees', 'progress')
