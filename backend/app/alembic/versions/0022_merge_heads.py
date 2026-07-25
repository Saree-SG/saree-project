"""merge heads after parallel migrations

Revision ID: 0022_merge_heads
Revises: 0020_material_request, 0021_push_subscription
Create Date: 2026-05-06
"""

from __future__ import annotations

revision = "0022_merge_heads"
down_revision = ("0020_material_request", "0021_push_subscription")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge two Alembic heads without schema changes."""


def downgrade() -> None:
    """Un-merge Alembic heads without schema changes."""

