"""add push subscription table

Revision ID: 0021_push_subscription
Revises: 0015_task_linked_entity
Create Date: 2026-05-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_push_subscription"
down_revision = "0015_task_linked_entity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    if sa_inspect(op.get_bind()).has_table("pushsubscription"):
        return
    op.create_table(
        "pushsubscription",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("p256dh", sa.String(), nullable=False),
        sa.Column("auth", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index("ix_pushsubscription_user_id", "pushsubscription", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_pushsubscription_user_id", table_name="pushsubscription")
    op.drop_table("pushsubscription")
