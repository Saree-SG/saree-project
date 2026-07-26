"""Add Task.required_headcount + Task.estimated_hours (điều phối / cân bằng tải).

Revision ID: 0046_task_staffing_workload
Revises: 0045_release_notes_seen
Create Date: 2026-07-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "0046_task_staffing_workload"
down_revision = "0045_release_notes_seen"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade():
    if not _has_column("task", "required_headcount"):
        op.add_column(
            "task",
            sa.Column(
                "required_headcount",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )
    if not _has_column("task", "estimated_hours"):
        op.add_column(
            "task",
            sa.Column("estimated_hours", sa.Float(), nullable=True),
        )


def downgrade():
    if _has_column("task", "estimated_hours"):
        op.drop_column("task", "estimated_hours")
    if _has_column("task", "required_headcount"):
        op.drop_column("task", "required_headcount")
