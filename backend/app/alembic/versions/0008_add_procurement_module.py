"""add procurement module

Revision ID: 0008_add_procurement_module
Revises: 0007_add_contract_module
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0008_add_procurement_module"
down_revision = "0007_add_contract_module"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "purchaserequest",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("project.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contract.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_number", sa.String(50), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("urgency", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("requested_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tech_reviewed_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tech_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tech_note", sa.Text(), nullable=True),
        sa.Column("director_approved_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("director_approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("director_note", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_purchaserequest_company_id", "purchaserequest", ["company_id"])

    op.create_table(
        "purchaserequestitem",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("request_id", UUID(as_uuid=True), sa.ForeignKey("purchaserequest.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("specifications", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("tech_note", sa.Text(), nullable=True),
        sa.Column("urgency_note", sa.Text(), nullable=True),
        sa.Column("ordered_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("received_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"),
    )
    op.create_index("ix_purchaserequestitem_request_id", "purchaserequestitem", ["request_id"])

    op.create_table(
        "purchaseorder",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", UUID(as_uuid=True), sa.ForeignKey("purchaserequest.id", ondelete="CASCADE"), nullable=False),
        sa.Column("po_number", sa.String(50), nullable=False, unique=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("expected_delivery_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_purchaseorder_company_id", "purchaseorder", ["company_id"])

    op.create_table(
        "purchaseorderitem",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("po_id", UUID(as_uuid=True), sa.ForeignKey("purchaseorder.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_item_id", UUID(as_uuid=True), sa.ForeignKey("purchaserequestitem.id", ondelete="SET NULL"), nullable=True),
        sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("specifications", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("selected_supplier_id", UUID(as_uuid=True), sa.ForeignKey("supplier.id", ondelete="SET NULL"), nullable=True),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=True),
        sa.Column("total_price", sa.Numeric(18, 2), nullable=True),
        sa.Column("received_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"),
    )
    op.create_index("ix_purchaseorderitem_po_id", "purchaseorderitem", ["po_id"])

    op.create_table(
        "supplierquote",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("po_item_id", UUID(as_uuid=True), sa.ForeignKey("purchaseorderitem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("supplier.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_name", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_supplierquote_po_item_id", "supplierquote", ["po_item_id"])


def downgrade():
    op.drop_table("supplierquote")
    op.drop_table("purchaseorderitem")
    op.drop_table("purchaseorder")
    op.drop_table("purchaserequestitem")
    op.drop_table("purchaserequest")
