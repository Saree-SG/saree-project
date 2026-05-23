"""add S3B_BOC_TACH stage support — no schema change needed (stage stored as varchar)

Revision ID: 0025_quotation_boc_tach_stage
Revises: 0024_chat_member_last_read_at
Create Date: 2026-05-18
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0025_quotation_boc_tach_stage"
down_revision = "0024_chat_member_last_read_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # S3B_BOC_TACH is stored as a plain varchar — no schema change required.
    # This migration seeds the new QUOTATION_BOC_TACH permission if the
    # permission table already exists (production-safe, idempotent).
    conn = op.get_bind()

    existing = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = 'QUOTATION_BOC_TACH' LIMIT 1")
    ).fetchone()

    if not existing:
        import uuid
        conn.execute(
            sa.text(
                "INSERT INTO permission (id, code, module, action, scope, description) "
                "VALUES (:id, :code, :module, :action, :scope, :description)"
            ),
            {
                "id": str(uuid.uuid4()),
                "code": "QUOTATION_BOC_TACH",
                "module": "quotation",
                "action": "update",
                "scope": "assigned",
                "description": "Kỹ Thuật bóc tách khối lượng và nộp BGĐ duyệt (S3B→S4)",
            },
        )

        # Grant to all roles that already have QUOTATION_DESIGN
        perm_row = conn.execute(
            sa.text("SELECT id FROM permission WHERE code = 'QUOTATION_BOC_TACH' LIMIT 1")
        ).fetchone()
        design_row = conn.execute(
            sa.text("SELECT id FROM permission WHERE code = 'QUOTATION_DESIGN' LIMIT 1")
        ).fetchone()

        if perm_row and design_row:
            role_rows = conn.execute(
                sa.text(
                    "SELECT role_id FROM rolepermission WHERE permission_id = :pid"
                ),
                {"pid": str(design_row.id)},
            ).fetchall()

            for row in role_rows:
                exists = conn.execute(
                    sa.text(
                        "SELECT 1 FROM rolepermission WHERE role_id = :rid AND permission_id = :pid LIMIT 1"
                    ),
                    {"rid": str(row.role_id), "pid": str(perm_row.id)},
                ).fetchone()
                if not exists:
                    conn.execute(
                        sa.text(
                            "INSERT INTO rolepermission (role_id, permission_id) VALUES (:rid, :pid)"
                        ),
                        {"rid": str(row.role_id), "pid": str(perm_row.id)},
                    )


def downgrade() -> None:
    conn = op.get_bind()
    perm_row = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = 'QUOTATION_BOC_TACH' LIMIT 1")
    ).fetchone()
    if perm_row:
        conn.execute(
            sa.text("DELETE FROM rolepermission WHERE permission_id = :pid"),
            {"pid": str(perm_row.id)},
        )
        conn.execute(
            sa.text("DELETE FROM permission WHERE code = 'QUOTATION_BOC_TACH'")
        )
