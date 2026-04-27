"""task linked entity table

Revision ID: 0015_task_linked_entity
Revises: 0014_material_issue_attachment
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_task_linked_entity"
down_revision = "0014_material_issue_attachment"
branch_labels = None
depends_on = None


def upgrade():
    """Create tasklinkedentity table for one-to-many task links."""
    op.create_table(
        "tasklinkedentity",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasklinkedentity_task_id", "tasklinkedentity", ["task_id"])
    op.create_index("ix_tasklinkedentity_entity_id", "tasklinkedentity", ["entity_id"])


def downgrade():
    """Drop tasklinkedentity table."""
    op.drop_index("ix_tasklinkedentity_entity_id", table_name="tasklinkedentity")
    op.drop_index("ix_tasklinkedentity_task_id", table_name="tasklinkedentity")
    op.drop_table("tasklinkedentity")
