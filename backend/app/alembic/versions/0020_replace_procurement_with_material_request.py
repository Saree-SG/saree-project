"""replace_procurement_with_material_request

Revision ID: 0020_material_request
Revises: 0019_quote_negotiation_perm
Create Date: 2026-04-29

Drop supplier / procurement / inventory tables.
Create material_request + material_request_attachment tables.
Insert new permissions and grant them to appropriate roles.
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0020_material_request"
down_revision = "0019_quote_negotiation_perm"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Table declarations (ad-hoc, no ORM import)
# ---------------------------------------------------------------------------

_permission_table = sa.table(
    "permission",
    sa.column("id", sa.Uuid()),
    sa.column("code", sa.String()),
    sa.column("module", sa.String()),
    sa.column("action", sa.String()),
    sa.column("scope", sa.String()),
    sa.column("description", sa.String()),
)

_role_table = sa.table(
    "role",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
)

_role_permission_table = sa.table(
    "rolepermission",
    sa.column("role_id", sa.Uuid()),
    sa.column("permission_id", sa.Uuid()),
)

# New permissions: (code, module, action, scope, description)
_NEW_PERMISSIONS = [
    ("MATERIAL_REQUEST_VIEW",    "material_request", "read",   "global", "Xem yêu cầu vật tư"),
    ("MATERIAL_REQUEST_CREATE",  "material_request", "create", "global", "Tạo yêu cầu vật tư"),
    ("MATERIAL_REQUEST_REVIEW",  "material_request", "approve","global", "Phòng vật tư duyệt yêu cầu (bước 1)"),
    ("MATERIAL_REQUEST_APPROVE", "material_request", "approve","global", "Giám đốc phê duyệt yêu cầu vật tư (bước 2)"),
]

# role_name → list of permission codes to grant
_ROLE_GRANT_MAP: dict[str, list[str]] = {
    "director":       ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_APPROVE"],
    "giam_doc":       ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_APPROVE"],
    "pho_giam_doc":   ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_APPROVE"],
    "admin":          ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE", "MATERIAL_REQUEST_REVIEW", "MATERIAL_REQUEST_APPROVE"],
    "department_head":["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "materials":      ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE", "MATERIAL_REQUEST_REVIEW"],
    "engineer":       ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "planner":        ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "workshop_lead":  ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "site_supply":    ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "sales":          ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "installer":      ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
    "worker":         ["MATERIAL_REQUEST_VIEW", "MATERIAL_REQUEST_CREATE"],
}


def upgrade() -> None:
    bind = op.get_bind()

    # ----------------------------------------------------------------
    # 1. Drop old tables — use CASCADE to handle FK deps regardless of order.
    #    Include both snake_case and camelCase variants for compatibility.
    # ----------------------------------------------------------------
    _drop_if_exists = [
        "materialissueitem", "material_issue_item",
        "materialissue", "material_issue",
        "stockmovement", "stock_movement",
        "inventoryitem", "inventory_item",
        "purchaseorderitem", "purchase_order_item",
        "supplierquote", "supplier_quote",
        "purchaseorder", "purchase_order",
        "purchaserequestitem", "purchase_request_item",
        "purchaserequest", "purchase_request",
        "vendor",
        "supplier",
    ]
    for tbl in _drop_if_exists:
        bind.execute(sa.text(f'DROP TABLE IF EXISTS "{tbl}" CASCADE'))

    # ----------------------------------------------------------------
    # 2. Create material_request table
    # ----------------------------------------------------------------
    if not _table_exists(bind, "material_request"):
        op.create_table(
            "material_request",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("company_id", sa.Uuid(), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("requester_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False, index=True),
            sa.Column("task_id", sa.Uuid(), sa.ForeignKey("task.id"), nullable=True),
            sa.Column("item_name", sa.String(), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(), nullable=False, server_default="cái"),
            sa.Column("reason", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="pending_materials", index=True),
            sa.Column("materials_reviewer_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=True),
            sa.Column("materials_reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("materials_note", sa.String(), nullable=True),
            sa.Column("director_reviewer_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=True),
            sa.Column("director_reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("director_note", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ----------------------------------------------------------------
    # 3. Create material_request_attachment table
    # ----------------------------------------------------------------
    if not _table_exists(bind, "material_request_attachment"):
        op.create_table(
            "material_request_attachment",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("request_id", sa.Uuid(), sa.ForeignKey("material_request.id"), nullable=False, index=True),
            sa.Column("filename", sa.String(), nullable=False),
            sa.Column("file_url", sa.String(), nullable=False),
            sa.Column("uploaded_by", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # ----------------------------------------------------------------
    # 4. Insert new permissions (idempotent)
    # ----------------------------------------------------------------
    perm_id_by_code: dict[str, uuid.UUID] = {}
    for code, module, action, scope, description in _NEW_PERMISSIONS:
        existing = bind.execute(
            sa.select(_permission_table.c.id).where(_permission_table.c.code == code)
        ).scalar_one_or_none()
        if existing is None:
            new_id = uuid.uuid4()
            bind.execute(
                sa.insert(_permission_table).values(
                    id=new_id, code=code, module=module,
                    action=action, scope=scope, description=description,
                )
            )
            perm_id_by_code[code] = new_id
        else:
            perm_id_by_code[code] = existing

    # ----------------------------------------------------------------
    # 5. Grant permissions to roles (idempotent)
    # ----------------------------------------------------------------
    for role_name, codes in _ROLE_GRANT_MAP.items():
        role_id = bind.execute(
            sa.select(_role_table.c.id).where(_role_table.c.name == role_name)
        ).scalar_one_or_none()
        if role_id is None:
            continue
        for code in codes:
            perm_id = perm_id_by_code.get(code)
            if perm_id is None:
                continue
            already = bind.execute(
                sa.select(_role_permission_table.c.role_id).where(
                    _role_permission_table.c.role_id == role_id,
                    _role_permission_table.c.permission_id == perm_id,
                )
            ).scalar_one_or_none()
            if already is None:
                bind.execute(
                    sa.insert(_role_permission_table).values(role_id=role_id, permission_id=perm_id)
                )

    # ----------------------------------------------------------------
    # 6. Remove old permissions from DB (procurement / supplier / inventory)
    # ----------------------------------------------------------------
    old_codes = [
        "PROCUREMENT_VIEW", "PROCUREMENT_REQUEST_CREATE", "PROCUREMENT_TECH_REVIEW",
        "PROCUREMENT_DIRECTOR_APPROVE", "PROCUREMENT_PO_CREATE", "PROCUREMENT_RECEIVE",
        "SUPPLIER_VIEW", "SUPPLIER_CREATE", "SUPPLIER_UPDATE", "SUPPLIER_DELETE",
        "INVENTORY_VIEW", "INVENTORY_MANAGE", "INVENTORY_ISSUE_REQUEST", "INVENTORY_APPROVE",
    ]
    for code in old_codes:
        perm_id = bind.execute(
            sa.select(_permission_table.c.id).where(_permission_table.c.code == code)
        ).scalar_one_or_none()
        if perm_id is None:
            continue
        bind.execute(
            sa.delete(_role_permission_table).where(_role_permission_table.c.permission_id == perm_id)
        )
        bind.execute(
            sa.delete(_permission_table).where(_permission_table.c.code == code)
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Drop new tables
    for tbl in ("material_request_attachment", "material_request"):
        if _table_exists(bind, tbl):
            op.drop_table(tbl)

    # Remove new permissions
    new_codes = [row[0] for row in _NEW_PERMISSIONS]
    for code in new_codes:
        perm_id = bind.execute(
            sa.select(_permission_table.c.id).where(_permission_table.c.code == code)
        ).scalar_one_or_none()
        if perm_id is None:
            continue
        bind.execute(
            sa.delete(_role_permission_table).where(_role_permission_table.c.permission_id == perm_id)
        )
        bind.execute(
            sa.delete(_permission_table).where(_permission_table.c.code == code)
        )


def _table_exists(bind, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return insp.has_table(table_name)
