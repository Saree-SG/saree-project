"""add module_tag and linked_entity to task

Revision ID: 0011_task_module_linked
Revises: 0010_contract_att_phase
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0011_task_module_linked"
down_revision = "0010_contract_att_phase"
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(op.get_bind())
    existing_cols = {c["name"] for c in insp.get_columns("task")}
    existing_idx = {i["name"] for i in insp.get_indexes("task")}
    if "module_tag" not in existing_cols:
        op.add_column("task", sa.Column("module_tag", sa.String(50), nullable=True))
    if "linked_entity_type" not in existing_cols:
        op.add_column("task", sa.Column("linked_entity_type", sa.String(50), nullable=True))
    if "linked_entity_id" not in existing_cols:
        op.add_column("task", sa.Column("linked_entity_id", sa.UUID(), nullable=True))
    if "ix_task_module_tag" not in existing_idx:
        op.create_index("ix_task_module_tag", "task", ["module_tag"])
    if "ix_task_linked_entity" not in existing_idx:
        op.create_index("ix_task_linked_entity", "task", ["linked_entity_type", "linked_entity_id"])


def downgrade():
    op.drop_index("ix_task_linked_entity", table_name="task")
    op.drop_index("ix_task_module_tag", table_name="task")
    op.drop_column("task", "linked_entity_id")
    op.drop_column("task", "linked_entity_type")
    op.drop_column("task", "module_tag")
