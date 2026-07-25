"""customer company directory + quotation link

Adds a `customercompany` table: a per-tenant directory of customer companies
("công ty khách hàng") and the tenant's own companies ("công ty của tôi"), with
contact info and an optional site location. Quotations gain an optional
`client_company_id` FK so they can link to a registered customer while keeping
the existing free-text client fields as a snapshot.

Revision ID: 0040_customer_company
Revises: 0039_attendance_company_mode
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0040_customer_company"
down_revision = "0039_attendance_company_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customercompany",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="customer"),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("tax_code", sa.String(length=50), nullable=True),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("contact_title", sa.String(length=100), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("site_lat", sa.Float(), nullable=True),
        sa.Column("site_lng", sa.Float(), nullable=True),
        sa.Column("site_radius_m", sa.Integer(), nullable=False, server_default="150"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_customercompany_company_id", "customercompany", ["company_id"]
    )
    op.create_index("ix_customercompany_name", "customercompany", ["name"])

    # Quotation link to the customer directory.
    op.add_column(
        "quotation", sa.Column("client_company_id", sa.Uuid(), nullable=True)
    )
    op.create_index(
        "ix_quotation_client_company_id", "quotation", ["client_company_id"]
    )
    op.create_foreign_key(
        "fk_quotation_client_company_id_customercompany",
        "quotation",
        "customercompany",
        ["client_company_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_quotation_client_company_id_customercompany", "quotation", type_="foreignkey"
    )
    op.drop_index("ix_quotation_client_company_id", table_name="quotation")
    op.drop_column("quotation", "client_company_id")

    op.drop_index("ix_customercompany_name", table_name="customercompany")
    op.drop_index("ix_customercompany_company_id", table_name="customercompany")
    op.drop_table("customercompany")
