"""grant_director_negotiation_permission

Revision ID: 0018_director_negotiation_perm
Revises: 0017_quotation_redesign
Create Date: 2026-04-28

Grant `QUOTATION_APPROVE_NEGOTIATION` to director-like roles that approve final quotations.
"""
from alembic import op
import sqlalchemy as sa

revision = "0018_director_negotiation_perm"
down_revision = "0017_quotation_redesign"
branch_labels = None
depends_on = None


def upgrade():
    """Grant negotiation approval permission to director roles."""
    bind = op.get_bind()

    role_table = sa.table(
        "role",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
    )
    permission_table = sa.table(
        "permission",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
    )
    role_permission_table = sa.table(
        "rolepermission",
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )

    permission_id = bind.execute(
        sa.select(permission_table.c.id).where(
            permission_table.c.code == "QUOTATION_APPROVE_NEGOTIATION"
        )
    ).scalar_one_or_none()
    if permission_id is None:
        return

    role_ids = bind.execute(
        sa.select(role_table.c.id).where(
            role_table.c.name.in_(("director", "giam_doc", "pho_giam_doc"))
        )
    ).scalars().all()
    if not role_ids:
        return

    existing_role_ids = set(
        bind.execute(
            sa.select(role_permission_table.c.role_id).where(
                role_permission_table.c.permission_id == permission_id,
                role_permission_table.c.role_id.in_(role_ids),
            )
        ).scalars().all()
    )

    missing_rows = [
        {"role_id": role_id, "permission_id": permission_id}
        for role_id in role_ids
        if role_id not in existing_role_ids
    ]
    if not missing_rows:
        return

    bind.execute(sa.insert(role_permission_table), missing_rows)


def downgrade():
    """Revoke negotiation approval permission from patched director roles."""
    bind = op.get_bind()

    role_table = sa.table(
        "role",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
    )
    permission_table = sa.table(
        "permission",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
    )
    role_permission_table = sa.table(
        "rolepermission",
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )

    permission_id = bind.execute(
        sa.select(permission_table.c.id).where(
            permission_table.c.code == "QUOTATION_APPROVE_NEGOTIATION"
        )
    ).scalar_one_or_none()
    if permission_id is None:
        return

    role_ids = bind.execute(
        sa.select(role_table.c.id).where(
            role_table.c.name.in_(("director", "giam_doc", "pho_giam_doc"))
        )
    ).scalars().all()
    if not role_ids:
        return

    bind.execute(
        sa.delete(role_permission_table).where(
            role_permission_table.c.permission_id == permission_id,
            role_permission_table.c.role_id.in_(role_ids),
        )
    )
