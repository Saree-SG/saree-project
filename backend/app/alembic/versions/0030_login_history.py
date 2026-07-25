"""add login_history table

Revision ID: 0030_login_history
Revises: 0029_taskprofile_company
Create Date: 2026-05-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0030_login_history"
down_revision = "0029_taskprofile_company"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loginhistory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("login_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_loginhistory_user_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loginhistory_user_id", "loginhistory", ["user_id"])
    op.create_index("ix_loginhistory_email", "loginhistory", ["email"])
    op.create_index("ix_loginhistory_login_at", "loginhistory", ["login_at"])
    op.create_index("ix_loginhistory_success", "loginhistory", ["success"])


def downgrade() -> None:
    op.drop_index("ix_loginhistory_success", table_name="loginhistory")
    op.drop_index("ix_loginhistory_login_at", table_name="loginhistory")
    op.drop_index("ix_loginhistory_email", table_name="loginhistory")
    op.drop_index("ix_loginhistory_user_id", table_name="loginhistory")
    op.drop_table("loginhistory")
