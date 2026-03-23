"""drop item table for mes core

Revision ID: c31ddca91e11
Revises: 8b14bea322e7
Create Date: 2026-03-23 23:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c31ddca91e11"
down_revision = "8b14bea322e7"
branch_labels = None
depends_on = None


def upgrade():
    """Drop legacy item table from MES-first backend."""
    op.drop_table("item")


def downgrade():
    """Recreate legacy item table."""
    op.create_table(
        "item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

