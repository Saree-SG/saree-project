"""add task.arrive_at

Revision ID: 0047_task_arrive_at
Revises: 0046_task_staffing_workload
Create Date: 2026-07-26
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0047_task_arrive_at"
down_revision = "0046_task_staffing_workload"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    if not _has_column("task", "arrive_at"):
        op.add_column(
            "task",
            sa.Column("arrive_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("task", "arrive_at")
