"""quotation_redesign_file_based

Revision ID: 0017_quotation_redesign
Revises: 0016_quotation_survey_contact
Create Date: 2026-04-28

Removes line items, adds document_category to attachments,
replaces pricing fields with total_contract_value,
increases action field length, adds S8B stage support.
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision = '0017_quotation_redesign'
down_revision = '0016_quotation_survey_contact'
branch_labels = None
depends_on = None


def upgrade():
    # Drop line items table
    op.drop_table('quotationlineitem')

    # Add document_category to attachments
    op.add_column(
        'quotationattachment',
        sa.Column('document_category', sqlmodel.sql.sqltypes.AutoString(length=30),
                  nullable=False, server_default='other')
    )

    # Replace pricing fields on quotation with total_contract_value
    op.add_column(
        'quotation',
        sa.Column('total_contract_value', sa.Float(), nullable=True)
    )
    op.drop_column('quotation', 'price_coefficient')
    op.drop_column('quotation', 'total_cost_price')
    op.drop_column('quotation', 'total_sale_price')

    # Increase action field length from 20 to 50
    op.alter_column(
        'quotationstagetransition',
        'action',
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=20),
        type_=sqlmodel.sql.sqltypes.AutoString(length=50),
        existing_nullable=False,
    )


def downgrade():
    # Restore action field length
    op.alter_column(
        'quotationstagetransition',
        'action',
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=50),
        type_=sqlmodel.sql.sqltypes.AutoString(length=20),
        existing_nullable=False,
    )

    # Restore pricing fields
    op.drop_column('quotation', 'total_contract_value')
    op.add_column('quotation', sa.Column('price_coefficient', sa.Float(), nullable=True))
    op.add_column('quotation', sa.Column('total_cost_price', sa.Float(), nullable=True))
    op.add_column('quotation', sa.Column('total_sale_price', sa.Float(), nullable=True))

    # Remove document_category
    op.drop_column('quotationattachment', 'document_category')

    # Recreate line items table (minimal for downgrade)
    op.create_table(
        'quotationlineitem',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('quotation_id', sa.Uuid(), sa.ForeignKey('quotation.id'), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('item_code', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=False),
        sa.Column('specifications', sa.Text(), nullable=True),
        sa.Column('unit', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('cost_unit_price', sa.Float(), nullable=True),
        sa.Column('cost_total', sa.Float(), nullable=True),
        sa.Column('supplier_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('supplier_lead_time_days', sa.Integer(), nullable=True),
        sa.Column('procurement_note', sa.Text(), nullable=True),
        sa.Column('sale_unit_price', sa.Float(), nullable=True),
        sa.Column('sale_total', sa.Float(), nullable=True),
        sa.Column('created_by_role', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False, server_default='technical'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
