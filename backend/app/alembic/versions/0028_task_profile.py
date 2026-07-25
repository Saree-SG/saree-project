"""add TaskProfile and TaskProfileItem tables

Revision ID: 0028_task_profile
Revises: 0027_quotation_approval_participants
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0028_task_profile"
down_revision = "0027_quotation_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taskprofile",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_taskprofile_created_by", "taskprofile", ["created_by"])

    op.create_table(
        "taskprofileitem",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("parent_item_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("module_tag", sa.String(length=50), nullable=True),
        sa.Column("color", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(["profile_id"], ["taskprofile.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_item_id"], ["taskprofileitem.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_taskprofileitem_profile_id", "taskprofileitem", ["profile_id"])
    op.create_index("ix_taskprofileitem_parent_item_id", "taskprofileitem", ["parent_item_id"])


def downgrade() -> None:
    op.drop_table("taskprofileitem")
    op.drop_table("taskprofile")
