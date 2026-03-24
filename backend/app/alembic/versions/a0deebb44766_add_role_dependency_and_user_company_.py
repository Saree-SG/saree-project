"""add role dependency and user company role

Revision ID: a0deebb44766
Revises: c31ddca91e11
Create Date: 2026-03-24 00:42:12.946379

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'a0deebb44766'
down_revision = 'c31ddca91e11'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('roledependency',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('company_id', sa.Uuid(), nullable=False),
    sa.Column('from_role_id', sa.Uuid(), nullable=False),
    sa.Column('to_role_id', sa.Uuid(), nullable=False),
    sa.Column('relation_type', sqlmodel.sql.sqltypes.AutoString(length=40), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['company.id'], ),
    sa.ForeignKeyConstraint(['from_role_id'], ['role.id'], ),
    sa.ForeignKeyConstraint(['to_role_id'], ['role.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('company_id', 'from_role_id', 'to_role_id', 'relation_type')
    )
    op.create_index(op.f('ix_roledependency_company_id'), 'roledependency', ['company_id'], unique=False)
    op.create_index(op.f('ix_roledependency_from_role_id'), 'roledependency', ['from_role_id'], unique=False)
    op.create_index(op.f('ix_roledependency_to_role_id'), 'roledependency', ['to_role_id'], unique=False)
    op.create_table('usercompanyrole',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('company_id', sa.Uuid(), nullable=False),
    sa.Column('role_id', sa.Uuid(), nullable=False),
    sa.Column('is_primary', sa.Boolean(), nullable=False),
    sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['company.id'], ),
    sa.ForeignKeyConstraint(['role_id'], ['role.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'company_id', 'role_id')
    )
    op.create_index(op.f('ix_usercompanyrole_company_id'), 'usercompanyrole', ['company_id'], unique=False)
    op.create_index(op.f('ix_usercompanyrole_role_id'), 'usercompanyrole', ['role_id'], unique=False)
    op.create_index(op.f('ix_usercompanyrole_user_id'), 'usercompanyrole', ['user_id'], unique=False)
    op.create_index(
        "uq_usercompanyrole_primary",
        "usercompanyrole",
        ["user_id", "company_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = true"),
    )


def downgrade():
    op.drop_index("uq_usercompanyrole_primary", table_name="usercompanyrole")
    op.drop_index(op.f('ix_usercompanyrole_user_id'), table_name='usercompanyrole')
    op.drop_index(op.f('ix_usercompanyrole_role_id'), table_name='usercompanyrole')
    op.drop_index(op.f('ix_usercompanyrole_company_id'), table_name='usercompanyrole')
    op.drop_table('usercompanyrole')
    op.drop_index(op.f('ix_roledependency_to_role_id'), table_name='roledependency')
    op.drop_index(op.f('ix_roledependency_from_role_id'), table_name='roledependency')
    op.drop_index(op.f('ix_roledependency_company_id'), table_name='roledependency')
    op.drop_table('roledependency')
