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
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(op.get_bind())
    existing_cols = {c["name"] for c in insp.get_columns("materialissue")}
    existing_fks = {fk["name"] for fk in insp.get_foreign_keys("materialissue")}
    existing_idx = {i["name"] for i in insp.get_indexes("materialissue")}
    if "task_id" not in existing_cols:
        op.add_column("materialissue", sa.Column("task_id", sa.UUID(), nullable=True))
    if "fk_materialissue_task_id" not in existing_fks:
        op.create_foreign_key(
            "fk_materialissue_task_id", "materialissue", "task",
            ["task_id"], ["id"], ondelete="SET NULL",
        )
    if "ix_materialissue_task_id" not in existing_idx:
        op.create_index("ix_materialissue_task_id", "materialissue", ["task_id"])


def downgrade():
    op.drop_index("ix_materialissue_task_id", table_name="materialissue")
    op.drop_constraint("fk_materialissue_task_id", "materialissue", type_="foreignkey")
    op.drop_column("materialissue", "task_id")
