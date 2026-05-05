"""add phase to contract attachment

Revision ID: 0010_contract_att_phase
Revises: 0009_add_inventory_module
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0010_contract_att_phase"
down_revision = "0009_add_inventory_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contractattachment",
        sa.Column("phase", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("contractattachment", "phase")
