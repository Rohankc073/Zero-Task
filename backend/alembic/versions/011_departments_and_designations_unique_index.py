"""011_departments_and_designations_unique_index

Revision ID: 011_departments_unique
Revises: 010_superadmin_tasks
Create Date: 2026-09-13 18:40:00.000000

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '011_departments_unique'
down_revision: Union[str, None] = '010_superadmin_tasks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_company_normalized_name 
    ON public.departments (company_id, lower(trim(name)));

    CREATE UNIQUE INDEX IF NOT EXISTS uq_designations_company_normalized_name 
    ON public.designations (company_id, lower(trim(name)));
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX IF EXISTS public.uq_departments_company_normalized_name;
    DROP INDEX IF EXISTS public.uq_designations_company_normalized_name;
    """)
