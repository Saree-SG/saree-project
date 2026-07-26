"""Add SKILL_APPROVE permission and assign to director/dept-head roles

Revision ID: 0052_skill_approve_permission
Revises: 0051_skill_requests
Create Date: 2026-07-26
"""
import uuid
from alembic import op
import sqlalchemy as sa

revision = "0052_skill_approve_permission"
down_revision = "0051_skill_requests"
branch_labels = None
depends_on = None

PERM_CODE = "SKILL_APPROVE"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Insert permission if not exists
    existing = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_CODE},
    ).first()

    if existing is None:
        perm_id = str(uuid.uuid4())
        conn.execute(
            sa.text("""
                INSERT INTO permission (id, code, module, action, scope, description)
                VALUES (:id, :code, 'skill', 'approve', 'company', 'Duyệt/từ chối yêu cầu nâng cấp kỹ năng nhân viên')
            """),
            {"id": perm_id, "code": PERM_CODE},
        )
    else:
        perm_id = str(existing[0])

    # 2. Assign to all roles with level <= 2 (director, department_head, etc.)
    roles = conn.execute(
        sa.text("SELECT id FROM role WHERE level <= 2")
    ).fetchall()

    for (role_id,) in roles:
        conn.execute(
            sa.text("""
                INSERT INTO rolepermission (role_id, permission_id)
                VALUES (:role_id, :perm_id)
                ON CONFLICT DO NOTHING
            """),
            {"role_id": str(role_id), "perm_id": perm_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    perm = conn.execute(
        sa.text("SELECT id FROM permission WHERE code = :code"),
        {"code": PERM_CODE},
    ).first()
    if perm:
        conn.execute(
            sa.text("DELETE FROM rolepermission WHERE permission_id = :id"),
            {"id": str(perm[0])},
        )
        conn.execute(
            sa.text("DELETE FROM permission WHERE code = :code"),
            {"code": PERM_CODE},
        )
