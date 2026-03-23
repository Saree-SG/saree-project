"""add dependency type checklist delay request json fields

Revision ID: 8b14bea322e7
Revises: a7c3f8e12b45
Create Date: 2026-03-23 23:28:19.718887

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8b14bea322e7'
down_revision = 'a7c3f8e12b45'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('taskchecklist',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('task_id', sa.Uuid(), nullable=False),
    sa.Column('content', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
    sa.Column('is_completed', sa.Boolean(), nullable=False),
    sa.Column('completed_by', sa.Uuid(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['completed_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_taskchecklist_task_id'), 'taskchecklist', ['task_id'], unique=False)
    op.alter_column(
        'auditlog',
        'old_value',
        existing_type=sa.TEXT(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using='old_value::jsonb',
    )
    op.alter_column(
        'auditlog',
        'new_value',
        existing_type=sa.TEXT(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using='new_value::jsonb',
    )
    op.add_column('taskcomment', sa.Column('requested_end_time', sa.DateTime(), nullable=True))
    op.add_column('taskcomment', sa.Column('approval_status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True))
    op.add_column(
        'taskdependency',
        sa.Column(
            'dependency_type',
            sqlmodel.sql.sqltypes.AutoString(length=2),
            nullable=False,
            server_default='FS',
        ),
    )
    op.alter_column('taskdependency', 'dependency_type', server_default=None)
    op.alter_column(
        'tasklevelconfig',
        'assignable_role_ids',
        existing_type=sa.TEXT(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using='assignable_role_ids::jsonb',
    )


def downgrade():
    op.alter_column(
        'tasklevelconfig',
        'assignable_role_ids',
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.TEXT(),
        existing_nullable=True,
        postgresql_using='assignable_role_ids::text',
    )
    op.drop_column('taskdependency', 'dependency_type')
    op.drop_column('taskcomment', 'approval_status')
    op.drop_column('taskcomment', 'requested_end_time')
    op.alter_column(
        'auditlog',
        'new_value',
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.TEXT(),
        existing_nullable=True,
        postgresql_using='new_value::text',
    )
    op.alter_column(
        'auditlog',
        'old_value',
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.TEXT(),
        existing_nullable=True,
        postgresql_using='old_value::text',
    )
    op.drop_index(op.f('ix_taskchecklist_task_id'), table_name='taskchecklist')
    op.drop_table('taskchecklist')
