"""materialissue: add task_id column

Revision ID: 0013_materialissue_task_id
Revises: 0012_task_assignee
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0013_materialissue_task_id"
down_revision = "0012_task_assignee"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "materialissue",
        sa.Column("task_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_materialissue_task_id",
        "materialissue",
        "task",
        ["task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_materialissue_task_id", "materialissue", ["task_id"])


def downgrade():
    op.drop_index("ix_materialissue_task_id", table_name="materialissue")
    op.drop_constraint("fk_materialissue_task_id", "materialissue", type_="foreignkey")
    op.drop_column("materialissue", "task_id")
