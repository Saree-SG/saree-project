"""skill_change_request table

Revision ID: 0051_skill_requests
Revises: 0050_skills
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0051_skill_requests"
down_revision = "0050_skills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not _has_table("skill_change_request"):
        op.create_table(
            "skill_change_request",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False, index=True),
            sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=True),
            sa.Column("requested_skills", postgresql.JSONB, nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("skill_change_request")


def _has_table(name: str) -> bool:
    from sqlalchemy import inspect, text
    conn = op.get_bind()
    return inspect(conn).has_table(name)
