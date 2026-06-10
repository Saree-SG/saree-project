"""attendance: absent flag + check-out reminder timestamp

Revision ID: 0044_attendance_absent_reminder
Revises: 0043_leave_request
Create Date: 2026-06-10
"""

from alembic import op
import sqlalchemy as sa

revision = "0044_attendance_absent_reminder"
down_revision = "0043_leave_request"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendancerecord",
        sa.Column("is_absent", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "attendancerecord",
        sa.Column(
            "reminder_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("attendancerecord", "reminder_sent_at")
    op.drop_column("attendancerecord", "is_absent")
