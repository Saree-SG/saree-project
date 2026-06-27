"""attendance: check-in against a customer company

Lets a worker check in (company-mode) at a CUSTOMER company's site, validated
against the customer company's own coordinates. Adds a nullable
`customer_company_id` FK on attendancerecord (mutually exclusive with the
tenant `company_id`).

Revision ID: 0041_attendance_customer_company
Revises: 0040_customer_company
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0041_attendance_customer_company"
down_revision = "0040_customer_company"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendancerecord",
        sa.Column("customer_company_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_attendancerecord_customer_company_id",
        "attendancerecord",
        ["customer_company_id"],
    )
    op.create_foreign_key(
        "fk_attendancerecord_customer_company_id_customercompany",
        "attendancerecord",
        "customercompany",
        ["customer_company_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_attendancerecord_customer_company_id_customercompany",
        "attendancerecord",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_attendancerecord_customer_company_id", table_name="attendancerecord"
    )
    op.drop_column("attendancerecord", "customer_company_id")
