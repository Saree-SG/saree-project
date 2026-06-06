"""make auditlog.actor_id nullable for system-initiated actions

System jobs (delay auto-expiry, unread-assignment escalation) write audit rows
with no human actor. The column was NOT NULL, which would reject those inserts.

Revision ID: 0038_auditlog_actor_nullable
Revises: 0037_drop_taskproof
Create Date: 2026-06-06
"""

import sqlalchemy as sa
from alembic import op

revision = "0038_auditlog_actor_nullable"
down_revision = "0037_drop_taskproof"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("auditlog", "actor_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.alter_column("auditlog", "actor_id", existing_type=sa.Uuid(), nullable=False)
