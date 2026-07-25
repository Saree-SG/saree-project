"""add_quote_negotiation_perm

Revision ID: 0019_quote_negotiation_perm
Revises: 0018_director_negotiation_perm
Create Date: 2026-04-28

Ensure the quotation negotiation approval permission exists and is assigned.
"""
from alembic import op
import sqlalchemy as sa
import uuid

revision = "0019_quote_negotiation_perm"
down_revision = "0018_director_negotiation_perm"
branch_labels = None
depends_on = None


def upgrade():
    """Insert missing quotation negotiation permission and assign it."""
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
        sa.column("module", sa.String()),
        sa.column("action", sa.String()),
        sa.column("scope", sa.String()),
        sa.column("description", sa.String()),
    )
    role_permission_table = sa.table(
        "rolepermission",
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )

    permission_code = "QUOTATION_APPROVE_NEGOTIATION"
    permission_id = bind.execute(
        sa.select(permission_table.c.id).where(permission_table.c.code == permission_code)
    ).scalar_one_or_none()

    if permission_id is None:
        permission_id = uuid.uuid4()
        bind.execute(
            sa.insert(permission_table).values(
                id=permission_id,
                code=permission_code,
                module="quotation",
                action="approve",
                scope="global",
                description="Giam doc duyet/tu choi thuong luong gia (S8B)",
            )
        )

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
    if missing_rows:
        bind.execute(sa.insert(role_permission_table), missing_rows)


def downgrade():
    """Remove quotation negotiation permission assignment and code."""
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

    if role_ids:
        bind.execute(
            sa.delete(role_permission_table).where(
                role_permission_table.c.permission_id == permission_id,
                role_permission_table.c.role_id.in_(role_ids),
            )
        )

    bind.execute(
        sa.delete(permission_table).where(
            permission_table.c.code == "QUOTATION_APPROVE_NEGOTIATION"
        )
    )
