"""Initial schema (squashed — single migration for full current schema).

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-06-27
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

    # Import ALL models so SQLModel.metadata is fully populated.
    from app.models import (  # noqa: F401
        attendance,
        chat,
        contract,
        customer_company,
        incident,
        leave_request,
        notification,
        org,
        outbox,
        project,
        push_subscription,
        quotation,
        task,
        user,
    )

    bind = op.get_bind()
    SQLModel.metadata.create_all(bind=bind, checkfirst=True)


def downgrade():
    """Drop all tables for current SQLModel metadata."""
    from sqlmodel import SQLModel

    from app.models import (  # noqa: F401
        attendance,
        chat,
        contract,
        customer_company,
        incident,
        leave_request,
        notification,
        org,
        outbox,
        project,
        push_subscription,
        quotation,
        task,
        user,
    )

    bind = op.get_bind()
    SQLModel.metadata.drop_all(bind=bind)
