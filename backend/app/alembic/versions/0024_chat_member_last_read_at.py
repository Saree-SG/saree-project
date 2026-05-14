"""add last_read_at to chatmember

Revision ID: 0024_chat_member_last_read_at
Revises: 0023_remove_material_request
Create Date: 2026-05-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0024_chat_member_last_read_at"
down_revision = "0023_remove_material_request"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatmember",
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chatmember", "last_read_at")
