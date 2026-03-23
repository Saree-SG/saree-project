"""Add MES Task Management models

Revision ID: a7c3f8e12b45
Revises: 1a31ce608336
Create Date: 2026-03-23

Tables created:
  company, department, role, permission, role_permission,
  user_global_role, project, project_member_role, task_level_config,
  task, task_dependency, task_observer, task_comment, task_proof, audit_log

Columns added to user:
  company_id, department_id, job_title, availability_status
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers
revision = 'a7c3f8e12b45'
down_revision = 'fe56fa70289e'
branch_labels = None
depends_on = None


def upgrade():
    # === COMPANY ===
    op.create_table(
        'company',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('slug', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_company_name', 'company', ['name'])
    op.create_index('ix_company_slug', 'company', ['slug'], unique=True)

    # === DEPARTMENT ===
    op.create_table(
        'department',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('dept_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['company.id']),
        sa.ForeignKeyConstraint(['parent_id'], ['department.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_department_company_id', 'department', ['company_id'])
    op.create_index('ix_department_parent_id', 'department', ['parent_id'])

    # === ROLE ===
    op.create_table(
        'role',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['company.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_role_company_id', 'role', ['company_id'])

    # === PERMISSION ===
    op.create_table(
        'permission',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('module', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('scope', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_permission_code', 'permission', ['code'], unique=True)

    # === ROLE_PERMISSION ===
    op.create_table(
        'rolepermission',
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permission.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['role.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_id', 'permission_id'),
    )

    # === USER_GLOBAL_ROLE ===
    op.create_table(
        'userglobalrole',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['role.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('user_id', 'role_id'),
    )

    # === ALTER USER — add new columns ===
    op.add_column('user', sa.Column('company_id', sa.UUID(), nullable=True))
    op.add_column('user', sa.Column('department_id', sa.UUID(), nullable=True))
    op.add_column('user', sa.Column('job_title', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True))
    op.add_column('user', sa.Column('availability_status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='free'))
    op.create_foreign_key(None, 'user', 'company', ['company_id'], ['id'])
    op.create_foreign_key(None, 'user', 'department', ['department_id'], ['id'])
    op.create_index('ix_user_company_id', 'user', ['company_id'])
    op.create_index('ix_user_department_id', 'user', ['department_id'])

    # === PROJECT ===
    op.create_table(
        'project',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('code', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False, server_default='planning'),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('department_id', sa.UUID(), nullable=True),
        sa.Column('pm_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['company.id']),
        sa.ForeignKeyConstraint(['created_by'], ['user.id']),
        sa.ForeignKeyConstraint(['department_id'], ['department.id']),
        sa.ForeignKeyConstraint(['pm_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_project_code', 'project', ['code'])
    op.create_index('ix_project_company_id', 'project', ['company_id'])

    # === PROJECT_MEMBER_ROLE ===
    op.create_table(
        'projectmemberrole',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['role_id'], ['role.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_projectmemberrole_project_id', 'projectmemberrole', ['project_id'])
    op.create_index('ix_projectmemberrole_user_id', 'projectmemberrole', ['user_id'])

    # === TASK_LEVEL_CONFIG ===
    op.create_table(
        'tasklevelconfig',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('label', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('requires_proof', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('can_have_children', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('max_children', sa.Integer(), nullable=True),
        sa.Column('assignable_role_ids', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tasklevelconfig_project_id', 'tasklevelconfig', ['project_id'])

    # === TASK ===
    op.create_table(
        'task',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='medium'),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('level', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=30), nullable=False, server_default='todo'),
        sa.Column('assignor_id', sa.UUID(), nullable=False),
        sa.Column('assignee_id', sa.UUID(), nullable=False),
        sa.Column('actual_end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_on_critical_path', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assignee_id'], ['user.id']),
        sa.ForeignKeyConstraint(['assignor_id'], ['user.id']),
        sa.ForeignKeyConstraint(['parent_id'], ['task.id']),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_task_project_id', 'task', ['project_id'])
    op.create_index('ix_task_parent_id', 'task', ['parent_id'])
    op.create_index('ix_task_assignee_id', 'task', ['assignee_id'])
    op.create_index('ix_task_assignor_id', 'task', ['assignor_id'])

    # === TASK_DEPENDENCY ===
    op.create_table(
        'taskdependency',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('blocking_task_id', sa.UUID(), nullable=False),
        sa.Column('dependent_task_id', sa.UUID(), nullable=False),
        sa.Column('lag_hours', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['blocking_task_id'], ['task.id']),
        sa.ForeignKeyConstraint(['dependent_task_id'], ['task.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_taskdependency_blocking_task_id', 'taskdependency', ['blocking_task_id'])
    op.create_index('ix_taskdependency_dependent_task_id', 'taskdependency', ['dependent_task_id'])

    # === TASK_OBSERVER ===
    op.create_table(
        'taskobserver',
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['task.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('task_id', 'user_id'),
    )

    # === TASK_COMMENT ===
    op.create_table(
        'taskcomment',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('comment_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default='general'),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('author_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_edited', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['user.id']),
        sa.ForeignKeyConstraint(['task_id'], ['task.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_taskcomment_task_id', 'taskcomment', ['task_id'])
    op.create_index('ix_taskcomment_author_id', 'taskcomment', ['author_id'])

    # === TASK_PROOF ===
    op.create_table(
        'taskproof',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('uploader_id', sa.UUID(), nullable=False),
        sa.Column('file_url', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=False),
        sa.Column('file_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='image'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('gps_lat', sa.Float(), nullable=True),
        sa.Column('gps_lng', sa.Float(), nullable=True),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('device_info', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('review_status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='pending'),
        sa.Column('reviewer_id', sa.UUID(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['reviewer_id'], ['user.id']),
        sa.ForeignKeyConstraint(['task_id'], ['task.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploader_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_taskproof_task_id', 'taskproof', ['task_id'])
    op.create_index('ix_taskproof_uploader_id', 'taskproof', ['uploader_id'])

    # === AUDIT_LOG ===
    op.create_table(
        'auditlog',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('actor_id', sa.UUID(), nullable=False),
        sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('entity_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('old_value', sa.Text(), nullable=True),
        sa.Column('new_value', sa.Text(), nullable=True),
        sa.Column('ip_address', sqlmodel.sql.sqltypes.AutoString(length=45), nullable=True),
        sa.Column('user_agent', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_auditlog_actor_id', 'auditlog', ['actor_id'])
    op.create_index('ix_auditlog_action', 'auditlog', ['action'])
    op.create_index('ix_auditlog_entity_type', 'auditlog', ['entity_type'])
    op.create_index('ix_auditlog_entity_id', 'auditlog', ['entity_id'])


def downgrade():
    op.drop_table('auditlog')
    op.drop_table('taskproof')
    op.drop_table('taskcomment')
    op.drop_table('taskobserver')
    op.drop_table('taskdependency')
    op.drop_table('task')
    op.drop_table('tasklevelconfig')
    op.drop_table('projectmemberrole')
    op.drop_table('project')
    op.drop_column('user', 'availability_status')
    op.drop_column('user', 'job_title')
    op.drop_column('user', 'department_id')
    op.drop_column('user', 'company_id')
    op.drop_table('userglobalrole')
    op.drop_table('rolepermission')
    op.drop_table('permission')
    op.drop_table('role')
    op.drop_table('department')
    op.drop_table('company')
