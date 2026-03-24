"""add role policy_doc json

Revision ID: d4e2c6a91b12
Revises: a0deebb44766
Create Date: 2026-03-24 03:10:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "d4e2c6a91b12"
down_revision = "a0deebb44766"
branch_labels = None
depends_on = None


def upgrade():
    """Add policy_doc column for role action logic."""

    op.add_column("role", sa.Column("policy_doc", sa.JSON(), nullable=True))


def downgrade():
    """Drop policy_doc column from role."""

    op.drop_column("role", "policy_doc")
