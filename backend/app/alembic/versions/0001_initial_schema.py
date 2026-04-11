"""Initial schema (squashed).

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-04-09
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Create all tables for current SQLModel metadata."""
    from sqlmodel import SQLModel

    # Ensure models are imported so SQLModel.metadata is fully populated.
    from app.models import org, project, task, user  # noqa: F401

    bind = op.get_bind()
    SQLModel.metadata.create_all(bind=bind)


def downgrade():
    """Drop all tables for current SQLModel metadata."""
    from sqlmodel import SQLModel

    from app.models import org, project, task, user  # noqa: F401

    bind = op.get_bind()
    SQLModel.metadata.drop_all(bind=bind)

