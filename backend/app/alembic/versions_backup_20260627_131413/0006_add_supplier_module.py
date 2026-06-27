"""add_supplier_module

Revision ID: 0006_add_supplier_module
Revises: 5edf2c43c5c3
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


revision = '0006_add_supplier_module'
down_revision = '5edf2c43c5c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'supplier',
        sa.Column('supplier_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('contact_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('specialty', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('company_id', sa.Uuid(), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['company.id']),
        sa.ForeignKeyConstraint(['created_by'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_supplier_company_id', 'supplier', ['company_id'])


def downgrade():
    op.drop_index('ix_supplier_company_id', 'supplier')
    op.drop_table('supplier')
