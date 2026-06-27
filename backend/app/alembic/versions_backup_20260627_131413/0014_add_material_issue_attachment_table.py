"""material issue attachments table

Revision ID: 0014_material_issue_attachment
Revises: 0013_materialissue_task_id
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_material_issue_attachment"
down_revision = "0013_materialissue_task_id"
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect
    if sa_inspect(op.get_bind()).has_table("materialissueattachment"):
        return
    op.create_table(
        "materialissueattachment",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("issue_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=False),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("file_name", sa.String(length=500), nullable=False),
        sa.Column("file_type", sa.String(length=30), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["issue_id"], ["materialissue.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_materialissueattachment_issue_id",
        "materialissueattachment",
        ["issue_id"],
    )


def downgrade():
    op.drop_index("ix_materialissueattachment_issue_id", table_name="materialissueattachment")
    op.drop_table("materialissueattachment")
