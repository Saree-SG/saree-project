"""Add progress_weight column to task table.

Revision ID: 0004_add_task_progress_weight
Revises: 0003_add_notification_table
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_add_task_progress_weight"
down_revision = "0003_add_notification_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add progress_weight to task (nullable int — % of parent this subtask covers)."""
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(op.get_bind())
    if "progress_weight" in {c["name"] for c in insp.get_columns("task")}:
        return
    op.add_column(
        "task",
        sa.Column("progress_weight", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Remove progress_weight from task."""
    op.drop_column("task", "progress_weight")
