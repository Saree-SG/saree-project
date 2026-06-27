"""add attendance module + project site location

Revision ID: 0031_add_attendance_module
Revises: 0030_login_history
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0031_add_attendance_module"
down_revision = "0030_login_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Project site location (for on-site attendance) ---
    op.add_column("project", sa.Column("site_lat", sa.Float(), nullable=True))
    op.add_column("project", sa.Column("site_lng", sa.Float(), nullable=True))
    op.add_column(
        "project",
        sa.Column("site_radius_m", sa.Integer(), nullable=False, server_default="150"),
    )

    # --- Attendance records ---
    op.create_table(
        "attendancerecord",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("check_in_lat", sa.Float(), nullable=False),
        sa.Column("check_in_lng", sa.Float(), nullable=False),
        sa.Column("check_in_accuracy_m", sa.Float(), nullable=True),
        sa.Column("check_in_distance_m", sa.Float(), nullable=False),
        sa.Column("check_in_valid", sa.Boolean(), nullable=False),
        sa.Column("check_in_photo_url", sa.String(length=1000), nullable=False),
        sa.Column("check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_out_lat", sa.Float(), nullable=True),
        sa.Column("check_out_lng", sa.Float(), nullable=True),
        sa.Column("check_out_accuracy_m", sa.Float(), nullable=True),
        sa.Column("check_out_distance_m", sa.Float(), nullable=True),
        sa.Column("check_out_valid", sa.Boolean(), nullable=True),
        sa.Column("check_out_photo_url", sa.String(length=1000), nullable=True),
        sa.Column("work_hours", sa.Float(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_attendancerecord_user_id"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], name="fk_attendancerecord_project_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attendancerecord_user_id", "attendancerecord", ["user_id"])
    op.create_index("ix_attendancerecord_project_id", "attendancerecord", ["project_id"])
    op.create_index("ix_attendancerecord_work_date", "attendancerecord", ["work_date"])


def downgrade() -> None:
    op.drop_index("ix_attendancerecord_work_date", table_name="attendancerecord")
    op.drop_index("ix_attendancerecord_project_id", table_name="attendancerecord")
    op.drop_index("ix_attendancerecord_user_id", table_name="attendancerecord")
    op.drop_table("attendancerecord")
    op.drop_column("project", "site_radius_m")
    op.drop_column("project", "site_lng")
    op.drop_column("project", "site_lat")
