"""Add quotation_approval_participant table for multi-approver / delegate support

Revision ID: 0027_quotation_approval
Revises: 0026_group2_fields
Create Date: 2026-05-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0027_quotation_approval"
down_revision = "0026_group2_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quotationapprovalparticipant",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("quotation_id", sa.UUID(), nullable=False),
        sa.Column("stage", sa.String(50), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("has_approved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotation.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quotationapprovalparticipant_quotation_id", "quotationapprovalparticipant", ["quotation_id"])
    op.create_index("ix_quotationapprovalparticipant_user_id", "quotationapprovalparticipant", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_quotationapprovalparticipant_user_id", table_name="quotationapprovalparticipant")
    op.drop_index("ix_quotationapprovalparticipant_quotation_id", table_name="quotationapprovalparticipant")
    op.drop_table("quotationapprovalparticipant")
