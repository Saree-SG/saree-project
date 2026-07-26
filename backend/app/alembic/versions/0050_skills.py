"""add skill and userskill tables

Revision ID: 0050_skills
Revises: 0049_attendance_kpi
Create Date: 2026-07-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0050_skills"
down_revision = "0049_attendance_kpi"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def upgrade():
    if not _has_table("skill"):
        op.create_table(
            "skill",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("company_id", sa.Uuid(), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("category", sa.String(50), nullable=False, server_default="general"),
            sa.Column("description", sa.String(500), nullable=True),
        )

    if not _has_table("userskill"):
        op.create_table(
            "userskill",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False, index=True),
            sa.Column("skill_id", sa.Uuid(), sa.ForeignKey("skill.id"), nullable=False, index=True),
            sa.Column("company_id", sa.Uuid(), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade():
    op.drop_table("userskill")
    op.drop_table("skill")
