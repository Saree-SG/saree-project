"""add inventory module

Revision ID: 0009_add_inventory_module
Revises: 0008_add_procurement_module
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0009_add_inventory_module"
down_revision = "0008_add_procurement_module"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inventoryitem",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("item_code", sa.String(100), nullable=True),
        sa.Column("specifications", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("min_stock_alert", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("current_stock", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_inventoryitem_company_id", "inventoryitem", ["company_id"])

    op.create_table(
        "stockmovement",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", UUID(as_uuid=True), sa.ForeignKey("inventoryitem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movement_type", sa.String(10), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2), nullable=True),
        sa.Column("reference_type", sa.String(50), nullable=False),
        sa.Column("reference_id", UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("movement_date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("handled_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_stockmovement_item_id", "stockmovement", ["item_id"])
    op.create_index("ix_stockmovement_company_id", "stockmovement", ["company_id"])

    op.create_table(
        "materialissue",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("project.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contract.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issue_number", sa.String(50), nullable=False, unique=True),
        sa.Column("requested_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issued_by", UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_materialissue_company_id", "materialissue", ["company_id"])

    op.create_table(
        "materialissueitem",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("issue_id", UUID(as_uuid=True), sa.ForeignKey("materialissue.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inventory_item_id", UUID(as_uuid=True), sa.ForeignKey("inventoryitem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity_requested", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_issued", sa.Numeric(12, 3), nullable=True),
    )
    op.create_index("ix_materialissueitem_issue_id", "materialissueitem", ["issue_id"])


def downgrade():
    op.drop_table("materialissueitem")
    op.drop_table("materialissue")
    op.drop_table("stockmovement")
    op.drop_table("inventoryitem")
