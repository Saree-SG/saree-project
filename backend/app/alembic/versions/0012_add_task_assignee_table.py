"""add task_assignee table for multi-assignee support

Revision ID: 0012_task_assignee
Revises: 0011_task_module_linked
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0012_task_assignee"
down_revision = "0011_task_module_linked"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "taskassignee",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("assigned_by", sa.UUID(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["assigned_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),
    )
    op.create_index("ix_taskassignee_task_id", "taskassignee", ["task_id"])
    op.create_index("ix_taskassignee_user_id", "taskassignee", ["user_id"])


def downgrade():
    op.drop_index("ix_taskassignee_user_id", table_name="taskassignee")
    op.drop_index("ix_taskassignee_task_id", table_name="taskassignee")
    op.drop_table("taskassignee")
