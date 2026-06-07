"""seed CUSTOMER_VIEW / CUSTOMER_CREATE permissions

Adds dedicated permissions for the customer-company directory so access can be
edited per-role in the RBAC UI. Directors (L1) get every permission implicitly
and managers (L2) get these via MANAGER_AUTO_PERMISSION_CODES; this migration
only inserts the catalog rows (idempotent) so they appear in the editor and in
L1 effective-permission listings on existing databases.

Revision ID: 0042_customer_permissions
Revises: 0041_attendance_customer_company
Create Date: 2026-06-07
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0042_customer_permissions"
down_revision = "0041_attendance_customer_company"
branch_labels = None
depends_on = None


_PERMS = [
    ("CUSTOMER_VIEW", "customer", "read", "global", "Xem danh bạ công ty khách hàng"),
    ("CUSTOMER_CREATE", "customer", "create", "global", "Tạo/sửa/xóa công ty khách hàng"),
]


def upgrade() -> None:
    perm = sa.table(
        "permission",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("module", sa.String()),
        sa.column("action", sa.String()),
        sa.column("scope", sa.String()),
        sa.column("description", sa.Text()),
    )
    conn = op.get_bind()
    for code, module, action, scope, desc in _PERMS:
        exists = conn.execute(
            sa.text("SELECT 1 FROM permission WHERE code = :code"), {"code": code}
        ).first()
        if exists is None:
            conn.execute(
                perm.insert().values(
                    id=uuid.uuid4(),
                    code=code,
                    module=module,
                    action=action,
                    scope=scope,
                    description=desc,
                )
            )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM permission WHERE code IN ('CUSTOMER_VIEW', 'CUSTOMER_CREATE')")
    )
