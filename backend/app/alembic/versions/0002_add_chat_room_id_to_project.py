"""Add chat_room_id to project.

Revision ID: 0002_add_chat_room_id_to_project
Revises: 0001_initial_schema
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0002_add_chat_room_id_to_project"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade():
    """Add `project.chat_room_id` FK to `chatroom.id`."""
    op.add_column(
        "project",
        sa.Column("chat_room_id", postgresql.UUID(), nullable=True),
    )

    op.create_foreign_key(
        "fk_project_chat_room_id_chatroom",
        source_table="project",
        referent_table="chatroom",
        local_cols=["chat_room_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_project_chat_room_id", "project", ["chat_room_id"])


def downgrade():
    """Rollback `project.chat_room_id` column."""
    op.drop_index("ix_project_chat_room_id", table_name="project")
    op.drop_constraint(
        "fk_project_chat_room_id_chatroom",
        table_name="project",
        type_="foreignkey",
    )
    op.drop_column("project", "chat_room_id")

