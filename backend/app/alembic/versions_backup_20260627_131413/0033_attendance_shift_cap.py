"""attendance: shift cap + auto-close flags for forgotten check-out

Revision ID: 0033_attendance_shift_cap
Revises: 0032_add_incident_module
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0033_attendance_shift_cap"
down_revision = "0032_add_incident_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendancerecord",
        sa.Column("is_capped", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "attendancerecord",
        sa.Column(
            "is_auto_closed", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("attendancerecord", "is_auto_closed")
    op.drop_column("attendancerecord", "is_capped")
