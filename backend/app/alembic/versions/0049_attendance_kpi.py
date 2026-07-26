"""attendance KPI scoring fields + shift config table

Revision ID: 0049_attendance_kpi
Revises: 0048_lifecycle
Create Date: 2026-07-26
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0049_attendance_kpi"
down_revision = "0048_lifecycle"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def _has_table(name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name = :t"
        ),
        {"t": name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    # attendanceshiftconfig table
    if not _has_table("attendanceshiftconfig"):
        op.create_table(
            "attendanceshiftconfig",
            sa.Column("company_id", sa.Uuid(), sa.ForeignKey("company.id"), primary_key=True),
            sa.Column("check_in_deadline", sa.Time(), nullable=False, server_default="08:00:00"),
            sa.Column("check_out_earliest", sa.Time(), nullable=False, server_default="17:00:00"),
            sa.Column("tolerance_minutes", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("half_day_minutes", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("full_day_minutes", sa.Integer(), nullable=False, server_default="180"),
            sa.Column("timezone", sa.String(50), nullable=False, server_default="Asia/Ho_Chi_Minh"),
        )

    # attendancerecord — KPI fields
    for col_name, col_def in [
        ("deviation_minutes", sa.Column("deviation_minutes", sa.Integer(), nullable=False, server_default="0")),
        ("attendance_flag", sa.Column("attendance_flag", sa.String(20), nullable=False, server_default="ok")),
        ("attendance_label", sa.Column("attendance_label", sa.String(100), nullable=True)),
        ("kpi_weight", sa.Column("kpi_weight", sa.Float(), nullable=False, server_default="1.0")),
    ]:
        if not _has_column("attendancerecord", col_name):
            op.add_column("attendancerecord", col_def)


def downgrade() -> None:
    for col in ("deviation_minutes", "attendance_flag", "attendance_label", "kpi_weight"):
        op.drop_column("attendancerecord", col)
    op.drop_table("attendanceshiftconfig")
