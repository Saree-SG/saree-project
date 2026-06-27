"""remove_material_request_module

Revision ID: 0023_remove_material_request
Revises: 0022_merge_heads
Create Date: 2026-05-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0023_remove_material_request"
down_revision = "0022_merge_heads"
branch_labels = None
depends_on = None

_permission_table = sa.table(
    "permission",
    sa.column("id", sa.Uuid()),
    sa.column("code", sa.String()),
)

_role_permission_table = sa.table(
    "rolepermission",
    sa.column("role_id", sa.Uuid()),
    sa.column("permission_id", sa.Uuid()),
)

_MATERIAL_PERMISSION_CODES = (
    "MATERIAL_REQUEST_VIEW",
    "MATERIAL_REQUEST_CREATE",
    "MATERIAL_REQUEST_REVIEW",
    "MATERIAL_REQUEST_APPROVE",
)


def upgrade() -> None:
    bind = op.get_bind()

    if _table_exists(bind, "material_request_attachment"):
        op.drop_table("material_request_attachment")
    if _table_exists(bind, "material_request"):
        op.drop_table("material_request")

    permission_ids = bind.execute(
        sa.select(_permission_table.c.id).where(
            _permission_table.c.code.in_(_MATERIAL_PERMISSION_CODES)
        )
    ).scalars().all()
    if permission_ids:
        bind.execute(
            sa.delete(_role_permission_table).where(
                _role_permission_table.c.permission_id.in_(permission_ids)
            )
        )
        bind.execute(
            sa.delete(_permission_table).where(
                _permission_table.c.id.in_(permission_ids)
            )
        )


def downgrade() -> None:
    """No-op: material request module is intentionally removed."""


def _table_exists(bind, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table_name)
