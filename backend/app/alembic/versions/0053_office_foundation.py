"""Foundation for online Office editing: attachment_version table + storage_key columns + DOCUMENT_EDIT_ONLINE permission

Revision ID: 0053_office_foundation
Revises: 0052_skill_approve_permission
Create Date: 2026-09-13
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0053_office_foundation"
down_revision = "0052_skill_approve_permission"
branch_labels = None
depends_on = None

PERM_CODE = "DOCUMENT_EDIT_ONLINE"

# Attachment tables that gain a nullable storage_key column in this migration.
# (table_name, id_column_type)
ATTACHMENT_TABLES = [
    "quotationattachment",
    "contractattachment",
    "incidentattachment",
    "chatattachment",
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. attachment_version — shared version history for every attachment type
    op.create_table(
        "attachment_version",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("attachment_type", sa.String(length=30), nullable=False),
        sa.Column("attachment_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=1000), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("is_autosave", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("edited_by", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("attachment_type", "attachment_id", "version_no", name="uq_attachment_version_seq"),
    )
    op.create_index(
        "ix_attachment_version_lookup",
        "attachment_version",
        ["attachment_type", "attachment_id"],
    )

    # 2. storage_key on existing attachment tables (nullable — backfilled later, GĐ1)
    for table in ATTACHMENT_TABLES:
        op.add_column(table, sa.Column("storage_key", sa.String(length=1000), nullable=True))

    # 3. Seed DOCUMENT_EDIT_ONLINE permission + grant to roles with level <= 1
    existing = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_CODE},
    ).first()

    if existing is None:
        perm_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                """
                INSERT INTO permission (id, code, module, action, scope, description)
                VALUES (:id, :code, 'document', 'edit', 'company', 'Sửa file Word/Excel/PowerPoint trực tuyến trên web')
                """
            ),
            {"id": perm_id, "code": PERM_CODE},
        )
    else:
        perm_id = str(existing[0])

    role_rows = conn.execute(sa.text("SELECT id FROM role WHERE level <= 1")).all()
    for (role_id,) in role_rows:
        already = conn.execute(
            sa.text(
                "SELECT 1 FROM rolepermission WHERE role_id = :role_id AND permission_id = :perm_id"
            ),
            {"role_id": role_id, "perm_id": perm_id},
        ).first()
        if already is None:
            conn.execute(
                sa.text(
                    "INSERT INTO rolepermission (role_id, permission_id) VALUES (:role_id, :perm_id)"
                ),
                {"role_id": role_id, "perm_id": perm_id},
            )


def downgrade() -> None:
    conn = op.get_bind()

    existing = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_CODE},
    ).first()
    if existing is not None:
        perm_id = existing[0]
        conn.execute(sa.text("DELETE FROM rolepermission WHERE permission_id = :id"), {"id": perm_id})
        conn.execute(sa.text("DELETE FROM permission WHERE id = :id"), {"id": perm_id})

    for table in ATTACHMENT_TABLES:
        op.drop_column(table, "storage_key")

    op.drop_index("ix_attachment_version_lookup", table_name="attachment_version")
    op.drop_table("attachment_version")
