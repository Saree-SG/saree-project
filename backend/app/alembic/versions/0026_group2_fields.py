"""Group 2 fields: quotation.color, project.project_type, task.color, task.performance_coefficient

Revision ID: 0026_group2_fields
Revises: 0025_quotation_boc_tach_stage
Create Date: 2026-05-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0026_group2_fields"
down_revision = "0025_quotation_boc_tach_stage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A5 — quotation.color
    op.add_column(
        "quotation",
        sa.Column("color", sa.String(30), nullable=True),
    )

    # A6 — project.project_type
    op.add_column(
        "project",
        sa.Column(
            "project_type",
            sa.String(20),
            nullable=False,
            server_default="client",
        ),
    )

    # B3 — task.color
    op.add_column(
        "task",
        sa.Column("color", sa.String(30), nullable=True),
    )

    # B8 — task.performance_coefficient
    op.add_column(
        "task",
        sa.Column("performance_coefficient", sa.Double(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("task", "performance_coefficient")
    op.drop_column("task", "color")
    op.drop_column("project", "project_type")
    op.drop_column("quotation", "color")
