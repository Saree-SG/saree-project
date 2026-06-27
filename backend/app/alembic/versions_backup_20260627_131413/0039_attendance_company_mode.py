"""attendance: by-company check-in mode + company site location

Adds a second attendance mode. Besides checking in against a project site, a
worker can check in against a COMPANY (e.g. helping out at another company's
site) with a free-text task. Companies gain site coordinates + radius so the
GPS validation works the same way as for projects.

Revision ID: 0039_attendance_company_mode
Revises: 0038_auditlog_actor_nullable
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0039_attendance_company_mode"
down_revision = "0038_auditlog_actor_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Company site location (mirrors project site columns).
    op.add_column("company", sa.Column("site_lat", sa.Float(), nullable=True))
    op.add_column("company", sa.Column("site_lng", sa.Float(), nullable=True))
    op.add_column(
        "company",
        sa.Column("site_radius_m", sa.Integer(), nullable=False, server_default="150"),
    )

    # Attendance mode + company linkage + ad-hoc task.
    op.add_column(
        "attendancerecord",
        sa.Column(
            "mode", sa.String(length=20), nullable=False, server_default="project"
        ),
    )
    op.add_column(
        "attendancerecord",
        sa.Column("company_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "attendancerecord",
        sa.Column("task_label", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_attendancerecord_company_id", "attendancerecord", ["company_id"]
    )
    op.create_foreign_key(
        "fk_attendancerecord_company_id_company",
        "attendancerecord",
        "company",
        ["company_id"],
        ["id"],
    )
    # project_id becomes nullable (company-mode records have no project).
    op.alter_column(
        "attendancerecord", "project_id", existing_type=sa.Uuid(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "attendancerecord", "project_id", existing_type=sa.Uuid(), nullable=False
    )
    op.drop_constraint(
        "fk_attendancerecord_company_id_company", "attendancerecord", type_="foreignkey"
    )
    op.drop_index("ix_attendancerecord_company_id", table_name="attendancerecord")
    op.drop_column("attendancerecord", "task_label")
    op.drop_column("attendancerecord", "company_id")
    op.drop_column("attendancerecord", "mode")

    op.drop_column("company", "site_radius_m")
    op.drop_column("company", "site_lng")
    op.drop_column("company", "site_lat")
