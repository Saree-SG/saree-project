"""add_contract_module

Revision ID: 0007_add_contract_module
Revises: 0006_add_supplier_module
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


revision = '0007_add_contract_module'
down_revision = '0006_add_supplier_module'
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(op.get_bind())

    if not insp.has_table('contract'):
        op.create_table(
            'contract',
            sa.Column('contract_date', sa.Date(), nullable=False),
            sa.Column('total_value', sa.Float(), nullable=False),
            sa.Column('currency', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=False),
            sa.Column('advance_amount', sa.Float(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('company_id', sa.Uuid(), nullable=False),
            sa.Column('quotation_id', sa.Uuid(), nullable=False),
            sa.Column('project_id', sa.Uuid(), nullable=True),
            sa.Column('contract_number', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
            sa.Column('signing_date', sa.Date(), nullable=True),
            sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
            sa.Column('advance_paid_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('advance_paid_by', sa.Uuid(), nullable=True),
            sa.Column('created_by', sa.Uuid(), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.Column('deleted_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['advance_paid_by'], ['user.id']),
            sa.ForeignKeyConstraint(['company_id'], ['company.id']),
            sa.ForeignKeyConstraint(['created_by'], ['user.id']),
            sa.ForeignKeyConstraint(['project_id'], ['project.id']),
            sa.ForeignKeyConstraint(['quotation_id'], ['quotation.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('quotation_id'),
        )
        op.create_index('ix_contract_company_id', 'contract', ['company_id'])
        op.create_index('ix_contract_contract_number', 'contract', ['contract_number'])
        op.create_index('ix_contract_project_id', 'contract', ['project_id'])
        op.create_index('ix_contract_quotation_id', 'contract', ['quotation_id'])

    if not insp.has_table('contractattachment'):
        op.create_table(
            'contractattachment',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('contract_id', sa.Uuid(), nullable=False),
            sa.Column('uploaded_by', sa.Uuid(), nullable=False),
            sa.Column('file_url', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=False),
            sa.Column('file_name', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
            sa.Column('file_type', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
            sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
            sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['contract_id'], ['contract.id']),
            sa.ForeignKeyConstraint(['uploaded_by'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_contractattachment_contract_id', 'contractattachment', ['contract_id'])

    if not insp.has_table('contractstatustransition'):
        op.create_table(
            'contractstatustransition',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('contract_id', sa.Uuid(), nullable=False),
            sa.Column('from_status', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
            sa.Column('to_status', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
            sa.Column('actor_id', sa.Uuid(), nullable=False),
            sa.Column('actor_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
            sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['actor_id'], ['user.id']),
            sa.ForeignKeyConstraint(['contract_id'], ['contract.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_contractstatustransition_contract_id', 'contractstatustransition', ['contract_id'])


def downgrade():
    op.drop_index('ix_contractstatustransition_contract_id', 'contractstatustransition')
    op.drop_table('contractstatustransition')
    op.drop_index('ix_contractattachment_contract_id', 'contractattachment')
    op.drop_table('contractattachment')
    op.drop_index('ix_contract_quotation_id', 'contract')
    op.drop_index('ix_contract_project_id', 'contract')
    op.drop_index('ix_contract_contract_number', 'contract')
    op.drop_index('ix_contract_company_id', 'contract')
    op.drop_table('contract')
