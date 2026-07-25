"""Add User.last_seen_release_version (release-notes read-state per account).

Revision ID: 0002_release_notes_seen
Revises: 0001_initial_schema
Create Date: 2026-07-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "0002_release_notes_seen"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    """0001 uses create_all(checkfirst=True) against the CURRENT models, so on a
    brand-new DB it already creates this column — this migration only needs to
    act on DBs that predate the field being added to the model."""
    bind = op.get_bind()
    return column in {col["name"] for col in inspect(bind).get_columns(table)}


def upgrade():
    if not _has_column("user", "last_seen_release_version"):
        op.add_column(
            "user",
            sa.Column("last_seen_release_version", sa.String(length=50), nullable=True),
        )


def downgrade():
    if _has_column("user", "last_seen_release_version"):
        op.drop_column("user", "last_seen_release_version")
