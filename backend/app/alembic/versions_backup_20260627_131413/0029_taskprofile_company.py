"""add company_id to taskprofile

Revision ID: 0029_taskprofile_company
Revises: 0028_task_profile
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0029_taskprofile_company"
down_revision = "0028_task_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "taskprofile",
        sa.Column("company_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_taskprofile_company_id",
        "taskprofile",
        "company",
        ["company_id"],
        ["id"],
    )
    op.create_index("ix_taskprofile_company_id", "taskprofile", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_taskprofile_company_id", table_name="taskprofile")
    op.drop_constraint("fk_taskprofile_company_id", "taskprofile", type_="foreignkey")
    op.drop_column("taskprofile", "company_id")
