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
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # A5 — quotation.color
    quotation_cols = [c["name"] for c in inspector.get_columns("quotation")]
    if "color" not in quotation_cols:
        op.add_column(
            "quotation",
            sa.Column("color", sa.String(30), nullable=True),
        )

    # A6 — project.project_type
    project_cols = [c["name"] for c in inspector.get_columns("project")]
    if "project_type" not in project_cols:
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
    task_cols = [c["name"] for c in inspector.get_columns("task")]
    if "color" not in task_cols:
        op.add_column(
            "task",
            sa.Column("color", sa.String(30), nullable=True),
        )

    # B8 — task.performance_coefficient
    if "performance_coefficient" not in task_cols:
        op.add_column(
            "task",
            sa.Column("performance_coefficient", sa.Double(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    task_cols = [c["name"] for c in inspector.get_columns("task")]
    if "performance_coefficient" in task_cols:
        op.drop_column("task", "performance_coefficient")
    if "color" in task_cols:
        op.drop_column("task", "color")

    project_cols = [c["name"] for c in inspector.get_columns("project")]
    if "project_type" in project_cols:
        op.drop_column("project", "project_type")

    quotation_cols = [c["name"] for c in inspector.get_columns("quotation")]
    if "color" in quotation_cols:
        op.drop_column("quotation", "color")

