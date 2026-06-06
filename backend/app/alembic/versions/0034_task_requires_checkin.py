"""task requires_checkin + progress report GPS

Revision ID: 0034_task_requires_checkin
Revises: 0033_attendance_shift_cap
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0034_task_requires_checkin"
down_revision = "0033_attendance_shift_cap"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "task",
        sa.Column(
            "requires_checkin", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column("taskprogressreport", sa.Column("gps_lat", sa.Float(), nullable=True))
    op.add_column("taskprogressreport", sa.Column("gps_lng", sa.Float(), nullable=True))
    op.add_column(
        "taskprogressreport", sa.Column("gps_accuracy_m", sa.Float(), nullable=True)
    )
    op.add_column(
        "taskprogressreport",
        sa.Column(
            "checkin_skipped", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("taskprogressreport", "checkin_skipped")
    op.drop_column("taskprogressreport", "gps_accuracy_m")
    op.drop_column("taskprogressreport", "gps_lng")
    op.drop_column("taskprogressreport", "gps_lat")
    op.drop_column("task", "requires_checkin")
