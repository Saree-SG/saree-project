"""Add notification table.

Revision ID: 0003_add_notification_table
Revises: 0002_add_chat_room_id_to_project
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_add_notification_table"
down_revision = "0002_add_chat_room_id_to_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create notification table."""
    op.create_table(
        "notification",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("user_id", postgresql.UUID(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("body", sa.String(length=1000), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_user_id", "notification", ["user_id"])
    op.create_index(
        "ix_notification_user_is_read",
        "notification",
        ["user_id", "is_read"],
    )


def downgrade() -> None:
    """Drop notification table."""
    op.drop_index("ix_notification_user_is_read", table_name="notification")
    op.drop_index("ix_notification_user_id", table_name="notification")
    op.drop_table("notification")
