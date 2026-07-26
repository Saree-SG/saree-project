"""task lifecycle fields + project.priority

Revision ID: 0048_task_lifecycle_project_priority
Revises: 0047_task_arrive_at
Create Date: 2026-07-26
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0048_lifecycle"
down_revision = "0047_task_arrive_at"
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
    # task — vòng đời mở rộng
    if not _has_column("task", "pause_note"):
        op.add_column("task", sa.Column("pause_note", sa.Text(), nullable=True))
    if not _has_column("task", "handoff_from_user_id"):
        op.add_column(
            "task",
            sa.Column(
                "handoff_from_user_id",
                sa.Uuid(),
                sa.ForeignKey("user.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if not _has_column("task", "continues_task_id"):
        op.add_column(
            "task",
            sa.Column(
                "continues_task_id",
                sa.Uuid(),
                sa.ForeignKey("task.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    # project — priority
    if not _has_column("project", "priority"):
        op.add_column(
            "project",
            sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        )


def downgrade() -> None:
    op.drop_column("task", "pause_note")
    op.drop_column("task", "handoff_from_user_id")
    op.drop_column("task", "continues_task_id")
    op.drop_column("project", "priority")
