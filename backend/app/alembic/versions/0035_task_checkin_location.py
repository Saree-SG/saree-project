"""task reference check-in location (lat/lng/radius)

Revision ID: 0035_task_checkin_location
Revises: 0034_task_requires_checkin
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0035_task_checkin_location"
down_revision = "0034_task_requires_checkin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task", sa.Column("checkin_lat", sa.Float(), nullable=True))
    op.add_column("task", sa.Column("checkin_lng", sa.Float(), nullable=True))
    op.add_column(
        "task",
        sa.Column(
            "checkin_radius_m",
            sa.Integer(),
            nullable=False,
            server_default="150",
        ),
    )


def downgrade() -> None:
    op.drop_column("task", "checkin_radius_m")
    op.drop_column("task", "checkin_lng")
    op.drop_column("task", "checkin_lat")
