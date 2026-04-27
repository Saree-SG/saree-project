"""
Seed script — Run once after migration to populate:
  - Default Roles (system roles, cannot be deleted)
  - Default Permissions matrix (all known permission codes)
  - Assign permissions to default roles

Usage:
    docker compose exec backend python -m app.scripts.seed_defaults
  or
    uv run python -m app.scripts.seed_defaults
"""
from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.db import engine
from app.models.org import (
    Company,
    Department,
    Permission,
    ProjectMemberRole,
    Role,
    RoleDependency,
    RolePermission,
    UserCompanyRole,
)
from app.models.user import User

# ---------------------------------------------------------------------------
# Default data
# ---------------------------------------------------------------------------

SYSTEM_ROLES = [
    {"name": "admin", "display_name": "System Admin", "level": 1, "is_system": True},
    {"name": "director", "display_name": "Giám đốc / BGD", "level": 1, "is_system": True},
    {"name": "department_head", "display_name": "Trưởng Phòng", "level": 2, "is_system": True},
    {"name": "sales", "display_name": "Phòng kinh doanh", "level": 2, "is_system": True},
    {"name": "engineer", "display_name": "Kỹ thuật / Thiết kế", "level": 2, "is_system": True},
    {"name": "materials", "display_name": "Phòng vật tư", "level": 2, "is_system": True},
    {"name": "planner", "display_name": "Phòng kế hoạch", "level": 2, "is_system": True},
    {"name": "workshop_lead", "display_name": "Tổ trưởng sản xuất", "level": 2, "is_system": True},
    {"name": "site_supply", "display_name": "Cung ứng vật tư công trình", "level": 2, "is_system": True},
    {"name": "installer", "display_name": "Lắp đặt công trình", "level": 3, "is_system": True},
    {"name": "worker", "display_name": "Tổ viên / Thực hiện", "level": 3, "is_system": True},
]

# fmt: off
ALL_PERMISSIONS = [
    # Project
    {"code": "PROJECT_VIEW",           "module": "project", "action": "read",   "scope": "assigned",    "description": "Xem dự án được tham gia"},
    {"code": "PROJECT_VIEW_ALL",       "module": "project", "action": "read",   "scope": "global",      "description": "Xem tất cả dự án trong công ty"},
    {"code": "PROJECT_CREATE",         "module": "project", "action": "create", "scope": "global",      "description": "Tạo dự án mới"},
    {"code": "PROJECT_UPDATE",         "module": "project", "action": "update", "scope": "assigned",    "description": "Cập nhật thông tin dự án"},
    {"code": "PROJECT_MANAGE_MEMBERS", "module": "project", "action": "update", "scope": "assigned",    "description": "Thêm/xóa thành viên dự án"},
    {"code": "PROJECT_DELETE",         "module": "project", "action": "delete", "scope": "global",      "description": "Xóa dự án"},
    # Task
    {"code": "TASK_CREATE",            "module": "task",    "action": "create", "scope": "project",     "description": "Tạo công việc mới"},
    {"code": "TASK_VIEW",              "module": "task",    "action": "read",   "scope": "assigned",    "description": "Xem công việc được giao"},
    {"code": "TASK_VIEW_ALL",          "module": "task",    "action": "read",   "scope": "project",     "description": "Xem tất cả công việc trong dự án"},
    {"code": "TASK_UPDATE",            "module": "task",    "action": "update", "scope": "project",     "description": "Cập nhật thông tin công việc"},
    {"code": "TASK_UPDATE_STATUS",     "module": "task",    "action": "update", "scope": "own",         "description": "Cập nhật trạng thái công việc được giao"},
    {"code": "TASK_DELETE",            "module": "task",    "action": "delete", "scope": "project",     "description": "Xóa công việc"},
    {"code": "TASK_REASSIGN",          "module": "task",    "action": "update", "scope": "project",     "description": "Giao lại công việc cho người khác"},
    # Comments
    {"code": "COMMENT_ADD",            "module": "task",    "action": "create", "scope": "assigned",    "description": "Thêm bình luận vào công việc"},
    {"code": "COMMENT_DELETE_OWN",     "module": "task",    "action": "delete", "scope": "own",         "description": "Xóa bình luận của chính mình"},
    {"code": "COMMENT_DELETE_ANY",     "module": "task",    "action": "delete", "scope": "project",     "description": "Xóa bất kỳ bình luận nào"},
    # Proofs
    {"code": "PROOF_UPLOAD",           "module": "task",    "action": "create", "scope": "own",         "description": "Upload bằng chứng hoàn thành"},
    {"code": "PROOF_APPROVE",          "module": "task",    "action": "approve","scope": "project",     "description": "Duyệt/từ chối bằng chứng"},
    # Reports
    {"code": "REPORT_VIEW_OWN",        "module": "report",  "action": "read",   "scope": "own",         "description": "Xem báo cáo của bản thân"},
    {"code": "REPORT_VIEW_TEAM",       "module": "report",  "action": "read",   "scope": "team",        "description": "Xem báo cáo của nhóm/phòng ban"},
    {"code": "REPORT_VIEW_ALL",        "module": "report",  "action": "read",   "scope": "global",      "description": "Xem tất cả báo cáo hệ thống"},
    # Audit
    {"code": "AUDIT_VIEW",             "module": "audit",   "action": "read",   "scope": "global",      "description": "Xem lịch sử thay đổi hệ thống"},
    # User management
    {"code": "USER_VIEW",              "module": "user",    "action": "read",   "scope": "global",      "description": "Xem danh sách người dùng"},
    {"code": "USER_MANAGE",            "module": "user",    "action": "update", "scope": "global",      "description": "Quản lý người dùng"},
    {"code": "COMPANY_CREATE",         "module": "company", "action": "create", "scope": "global",      "description": "Tạo công ty mới"},
    # Quotation
    {"code": "QUOTATION_CREATE",          "module": "quotation", "action": "create", "scope": "global",   "description": "Tạo hồ sơ báo giá mới"},
    {"code": "QUOTATION_VIEW",            "module": "quotation", "action": "read",   "scope": "assigned", "description": "Xem hồ sơ báo giá được phân công"},
    {"code": "QUOTATION_VIEW_ALL",        "module": "quotation", "action": "read",   "scope": "global",   "description": "Xem tất cả hồ sơ báo giá"},
    {"code": "QUOTATION_UPDATE",          "module": "quotation", "action": "update", "scope": "assigned", "description": "Cập nhật thông tin hồ sơ báo giá"},
    {"code": "QUOTATION_DELETE",          "module": "quotation", "action": "delete", "scope": "global",   "description": "Xóa hồ sơ báo giá (soft delete)"},
    {"code": "QUOTATION_SUBMIT_SURVEY",   "module": "quotation", "action": "update", "scope": "assigned", "description": "Kinh Doanh nộp thông tin khảo sát (S1→S2)"},
    {"code": "QUOTATION_APPROVE_SURVEY",  "module": "quotation", "action": "approve","scope": "global",   "description": "BGĐ duyệt/từ chối thông tin khảo sát (S2)"},
    {"code": "QUOTATION_DESIGN",          "module": "quotation", "action": "update", "scope": "assigned", "description": "Kỹ Thuật thiết kế và nộp phương án (S3→S4)"},
    {"code": "QUOTATION_APPROVE_DESIGN",  "module": "quotation", "action": "approve","scope": "global",   "description": "BGĐ duyệt/từ chối phương án thiết kế (S4)"},
    {"code": "QUOTATION_FILL_PRICE",      "module": "quotation", "action": "update", "scope": "assigned", "description": "Vật Tư điền đơn giá hạng mục (S5→S6)"},
    {"code": "QUOTATION_FINALIZE",        "module": "quotation", "action": "update", "scope": "assigned", "description": "Kinh Doanh nhập hệ số giá, hoàn thiện (S6→S7)"},
    {"code": "QUOTATION_APPROVE_FINAL",   "module": "quotation", "action": "approve","scope": "global",   "description": "BGĐ duyệt báo giá cuối (S7→S8)"},
    {"code": "QUOTATION_SEND_CLIENT",     "module": "quotation", "action": "update", "scope": "assigned", "description": "Ghi nhận đã gửi báo giá cho khách hàng (S8)"},
    {"code": "QUOTATION_LOG_NEGOTIATION", "module": "quotation", "action": "create", "scope": "assigned", "description": "Ghi log trao đổi thương lượng với khách hàng"},
    {"code": "QUOTATION_CLOSE",           "module": "quotation", "action": "update", "scope": "assigned", "description": "Đóng hồ sơ báo giá (won/lost) (S8→S9)"},
    {"code": "QUOTATION_REPORT",          "module": "quotation", "action": "read",   "scope": "global",   "description": "Xem báo cáo và thống kê báo giá"},
    # Procurement
    {"code": "PROCUREMENT_VIEW",            "module": "procurement", "action": "read",   "scope": "global",   "description": "Xem yêu cầu mua hàng và đơn đặt hàng"},
    {"code": "PROCUREMENT_REQUEST_CREATE",  "module": "procurement", "action": "create", "scope": "global",   "description": "Tạo và nộp yêu cầu mua hàng"},
    {"code": "PROCUREMENT_TECH_REVIEW",     "module": "procurement", "action": "approve","scope": "global",   "description": "Kỹ thuật duyệt yêu cầu mua hàng"},
    {"code": "PROCUREMENT_DIRECTOR_APPROVE","module": "procurement", "action": "approve","scope": "global",   "description": "BGĐ phê duyệt yêu cầu và chọn nhà cung cấp"},
    {"code": "PROCUREMENT_PO_CREATE",       "module": "procurement", "action": "create", "scope": "global",   "description": "Phòng vật tư tạo đơn mua hàng, nhập báo giá"},
    {"code": "PROCUREMENT_RECEIVE",         "module": "procurement", "action": "update", "scope": "global",   "description": "Xác nhận nhận hàng"},
    # Contract
    {"code": "CONTRACT_VIEW",             "module": "contract", "action": "read",   "scope": "assigned", "description": "Xem hợp đồng được phân công"},
    {"code": "CONTRACT_VIEW_ALL",         "module": "contract", "action": "read",   "scope": "global",   "description": "Xem tất cả hợp đồng"},
    {"code": "CONTRACT_CREATE",           "module": "contract", "action": "create", "scope": "global",   "description": "Tạo hợp đồng từ báo giá đã thắng"},
    {"code": "CONTRACT_UPDATE",           "module": "contract", "action": "update", "scope": "assigned", "description": "Cập nhật thông tin hợp đồng"},
    {"code": "CONTRACT_DELETE",           "module": "contract", "action": "delete", "scope": "global",   "description": "Xóa hợp đồng (soft delete)"},
    {"code": "CONTRACT_SUBMIT",           "module": "contract", "action": "update", "scope": "assigned", "description": "Nộp hợp đồng lên BGĐ duyệt (draft→pending_approval)"},
    {"code": "CONTRACT_APPROVE",          "module": "contract", "action": "approve","scope": "global",   "description": "BGĐ duyệt/từ chối hợp đồng (pending_approval→sent/draft)"},
    {"code": "CONTRACT_SIGN",             "module": "contract", "action": "update", "scope": "assigned", "description": "Xác nhận khách ký hợp đồng (sent→signed)"},
    {"code": "CONTRACT_CONFIRM_ADVANCE",  "module": "contract", "action": "update", "scope": "assigned", "description": "Xác nhận nhận tạm ứng (signed→advance_received)"},
    {"code": "CONTRACT_START_PRODUCTION", "module": "contract", "action": "approve","scope": "global",   "description": "Chuyển hợp đồng sang sản xuất (advance_received→in_production)"},
    {"code": "CONTRACT_COMPLETE",         "module": "contract", "action": "approve","scope": "global",   "description": "Hoàn thành và đóng hợp đồng (in_production→completed)"},
    # Supplier
    {"code": "SUPPLIER_VIEW",   "module": "supplier", "action": "read",   "scope": "global", "description": "Xem danh sách nhà cung cấp"},
    {"code": "SUPPLIER_CREATE", "module": "supplier", "action": "create", "scope": "global", "description": "Thêm nhà cung cấp mới"},
    {"code": "SUPPLIER_UPDATE", "module": "supplier", "action": "update", "scope": "global", "description": "Cập nhật thông tin nhà cung cấp"},
    {"code": "SUPPLIER_DELETE", "module": "supplier", "action": "delete", "scope": "global", "description": "Xóa nhà cung cấp (soft delete)"},
    # Inventory
    {"code": "INVENTORY_VIEW",          "module": "inventory", "action": "read",   "scope": "global", "description": "Xem tồn kho và lịch sử xuất nhập"},
    {"code": "INVENTORY_MANAGE",        "module": "inventory", "action": "update", "scope": "global", "description": "Quản lý kho: tạo/sửa mặt hàng, điều chỉnh tồn kho"},
    {"code": "INVENTORY_ISSUE_REQUEST", "module": "inventory", "action": "create", "scope": "global", "description": "Tạo phiếu xuất kho"},
    {"code": "INVENTORY_APPROVE",       "module": "inventory", "action": "approve","scope": "global", "description": "Duyệt phiếu xuất kho"},
]
# fmt: on

# Shared permission sets for process roles (Quy trình Saree)
_DEPT_HEAD_LIKE_PERMS: list[str] = [
    "PROJECT_VIEW", "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS",
    "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
    "TASK_REASSIGN",
    "COMMENT_ADD", "COMMENT_DELETE_OWN",
    "PROOF_UPLOAD", "PROOF_APPROVE",
    "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM",
    "USER_VIEW",
    # Quotation — base read
    "QUOTATION_VIEW", "QUOTATION_REPORT",
    # Supplier — view only
    "SUPPLIER_VIEW",
    # Contract — view only
    "CONTRACT_VIEW",
    # Procurement — view only
    "PROCUREMENT_VIEW",
    # Inventory — view only
    "INVENTORY_VIEW",
    # Inventory approval for trưởng phòng (áp dụng cho trưởng vật tư)
    "INVENTORY_APPROVE",
]

_WORKER_LIKE_PERMS: list[str] = [
    "PROJECT_VIEW",
    "TASK_VIEW", "TASK_UPDATE_STATUS",
    "COMMENT_ADD", "COMMENT_DELETE_OWN",
    "PROOF_UPLOAD",
    "REPORT_VIEW_OWN",
    # Quotation — read only
    "QUOTATION_VIEW",
]

# Quotation workflow permissions per department role
_SALES_QUOTATION_PERMS: list[str] = [
    "QUOTATION_CREATE", "QUOTATION_VIEW", "QUOTATION_VIEW_ALL",
    "QUOTATION_UPDATE", "QUOTATION_SUBMIT_SURVEY", "QUOTATION_FINALIZE",
    "QUOTATION_SEND_CLIENT", "QUOTATION_LOG_NEGOTIATION", "QUOTATION_CLOSE",
    "QUOTATION_REPORT",
]

_ENGINEER_QUOTATION_PERMS: list[str] = [
    "QUOTATION_VIEW", "QUOTATION_DESIGN",
]

_MATERIALS_QUOTATION_PERMS: list[str] = [
    "QUOTATION_VIEW", "QUOTATION_FILL_PRICE",
]

_DIRECTOR_QUOTATION_PERMS: list[str] = [
    "QUOTATION_VIEW_ALL", "QUOTATION_APPROVE_SURVEY", "QUOTATION_APPROVE_DESIGN",
    "QUOTATION_APPROVE_FINAL", "QUOTATION_DELETE", "QUOTATION_REPORT",
]

# Role → list of permission codes they receive
ROLE_PERMISSION_MAP: dict[str, list[str]] = {
    "admin": [p["code"] for p in ALL_PERMISSIONS],
    "director": [
        "PROJECT_VIEW", "PROJECT_VIEW_ALL", "PROJECT_CREATE", "PROJECT_UPDATE",
        "PROJECT_MANAGE_MEMBERS", "PROJECT_DELETE",
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
        "TASK_REASSIGN", "TASK_DELETE",
        "COMMENT_ADD", "COMMENT_DELETE_ANY",
        "PROOF_UPLOAD", "PROOF_APPROVE",
        "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM", "REPORT_VIEW_ALL",
        "AUDIT_VIEW", "USER_VIEW", "USER_MANAGE",
        *_DIRECTOR_QUOTATION_PERMS,
        "SUPPLIER_VIEW", "SUPPLIER_CREATE", "SUPPLIER_UPDATE", "SUPPLIER_DELETE",
        "CONTRACT_VIEW_ALL", "CONTRACT_APPROVE", "CONTRACT_START_PRODUCTION", "CONTRACT_COMPLETE", "CONTRACT_DELETE",
        "PROCUREMENT_VIEW", "PROCUREMENT_DIRECTOR_APPROVE",
        "INVENTORY_VIEW", "INVENTORY_MANAGE", "INVENTORY_APPROVE",
    ],
    "department_head": list(_DEPT_HEAD_LIKE_PERMS),
    "sales": [
        *_DEPT_HEAD_LIKE_PERMS, *_SALES_QUOTATION_PERMS,
        "CONTRACT_VIEW", "CONTRACT_CREATE", "CONTRACT_UPDATE",
        "CONTRACT_SUBMIT", "CONTRACT_SIGN", "CONTRACT_CONFIRM_ADVANCE",
    ],
    "engineer": [*_DEPT_HEAD_LIKE_PERMS, *_ENGINEER_QUOTATION_PERMS, "PROCUREMENT_REQUEST_CREATE", "PROCUREMENT_TECH_REVIEW"],
    "materials": [
        *_DEPT_HEAD_LIKE_PERMS, *_MATERIALS_QUOTATION_PERMS,
        "SUPPLIER_CREATE", "SUPPLIER_UPDATE",
        "PROCUREMENT_PO_CREATE", "PROCUREMENT_RECEIVE",
        "INVENTORY_MANAGE", "INVENTORY_APPROVE",
    ],
    "planner": list(_DEPT_HEAD_LIKE_PERMS),
    "workshop_lead": [*_DEPT_HEAD_LIKE_PERMS, "PROCUREMENT_REQUEST_CREATE", "INVENTORY_ISSUE_REQUEST"],
    "site_supply": [*_DEPT_HEAD_LIKE_PERMS, "PROCUREMENT_RECEIVE", "INVENTORY_ISSUE_REQUEST"],
    "installer": list(_WORKER_LIKE_PERMS),
    "worker": list(_WORKER_LIKE_PERMS),
}


DEFAULT_DEPARTMENTS = [
    {"name": "Phòng Kinh doanh", "dept_type": "office_block"},
    {"name": "Phòng Kỹ thuật / Thiết kế", "dept_type": "project_block"},
    {"name": "Phòng Vật tư", "dept_type": "office_block"},
    {"name": "Phòng Kế hoạch", "dept_type": "office_block"},
    {"name": "Sản xuất xưởng", "dept_type": "project_block"},
    {"name": "Cung ứng vật tư công trình", "dept_type": "project_block"},
    {"name": "Lắp đặt công trình", "dept_type": "project_block"},
]

# Department name used when binding superuser for org preview (seed tail).
ADMIN_PREVIEW_DEPARTMENT_NAMES: tuple[str, ...] = (
    "Phòng Kỹ thuật / Thiết kế",
    "Kỹ thuật",
)


DEMO_ROLES = [
    {
        "name": "demo_director",
        "display_name": "Giám đốc (Demo)",
        "level": 1,
        "is_system": False,
        "description": "Role demo để test sơ đồ tổ chức và phân cấp.",
    },
    {
        "name": "demo_department_head",
        "display_name": "Trưởng Phòng (Demo)",
        "level": 2,
        "is_system": False,
        "description": "Role demo để test cấp phòng ban.",
    },
    {
        "name": "demo_worker",
        "display_name": "Thợ (Demo)",
        "level": 3,
        "is_system": False,
        "description": "Role demo để test nhân sự thực thi công việc.",
    },
]


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

def seed(
    session: Session,
    company_id: uuid.UUID,
    *,
    assign_superuser_director: bool = True,
    assign_superuser_demo_worker: bool = True,
) -> None:
    """
    Idempotent seed — permissions, system + demo roles, departments, demo hierarchy.

    Toggle superuser side-effects when running from a full DB reset script.
    """

    print("▶ Seeding permissions...")
    perm_by_code: dict[str, Permission] = {}
    for p_data in ALL_PERMISSIONS:
        existing = session.exec(
            select(Permission).where(Permission.code == p_data["code"])
        ).first()
        if existing:
            perm_by_code[p_data["code"]] = existing
        else:
            perm = Permission(**p_data)
            session.add(perm)
            session.flush()
            perm_by_code[p_data["code"]] = perm
    print(f"  ✓ {len(ALL_PERMISSIONS)} permissions ensured")

    print("▶ Seeding system roles...")
    role_by_name: dict[str, Role] = {}
    expected_role_names = {role_data["name"] for role_data in SYSTEM_ROLES}

    stale_roles = session.exec(
        select(Role).where(Role.company_id == company_id, Role.name.notin_(expected_role_names))
    ).all()
    for stale_role in stale_roles:
        session.exec(select(RolePermission).where(RolePermission.role_id == stale_role.id)).all()
        role_permission_rows = session.exec(
            select(RolePermission).where(RolePermission.role_id == stale_role.id)
        ).all()
        for row in role_permission_rows:
            session.delete(row)
        member_rows = session.exec(
            select(ProjectMemberRole).where(ProjectMemberRole.role_id == stale_role.id)
        ).all()
        for row in member_rows:
            session.delete(row)
        assignment_rows = session.exec(
            select(UserCompanyRole).where(UserCompanyRole.role_id == stale_role.id)
        ).all()
        for row in assignment_rows:
            session.delete(row)
        dependency_rows = session.exec(
            select(RoleDependency).where(
                (RoleDependency.from_role_id == stale_role.id) | (RoleDependency.to_role_id == stale_role.id)
            )
        ).all()
        for row in dependency_rows:
            session.delete(row)
        session.delete(stale_role)
    if stale_roles:
        session.commit()
        print(f"  ✓ Removed {len(stale_roles)} deprecated roles")
    for r_data in SYSTEM_ROLES:
        existing = session.exec(
            select(Role).where(Role.name == r_data["name"], Role.company_id == company_id)
        ).first()
        if existing:
            existing.display_name = r_data["display_name"]
            existing.level = r_data["level"]
            existing.is_system = r_data["is_system"]
            session.add(existing)
            role_by_name[r_data["name"]] = existing
        else:
            role = Role(**r_data, company_id=company_id)
            session.add(role)
            session.flush()
            role_by_name[r_data["name"]] = role
    print(f"  ✓ {len(SYSTEM_ROLES)} roles ensured")

    print("▶ Seeding demo roles...")
    demo_by_name: dict[str, Role] = {}
    for r_data in DEMO_ROLES:
        existing = session.exec(
            select(Role).where(Role.name == r_data["name"], Role.company_id == company_id)
        ).first()
        if existing:
            existing.display_name = r_data["display_name"]
            existing.level = r_data["level"]
            existing.is_system = False
            existing.description = r_data.get("description")
            session.add(existing)
            demo_by_name[r_data["name"]] = existing
        else:
            role = Role(**r_data, company_id=company_id)
            session.add(role)
            session.flush()
            demo_by_name[r_data["name"]] = role
    session.commit()
    print(f"  ✓ {len(DEMO_ROLES)} demo roles ensured")

    print("▶ Assigning permissions to roles...")
    for role_name, perm_codes in ROLE_PERMISSION_MAP.items():
        role = role_by_name.get(role_name)
        if not role:
            continue
        for code in perm_codes:
            perm = perm_by_code.get(code)
            if not perm:
                continue
            existing_rp = session.exec(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == perm.id,
                )
            ).first()
            if not existing_rp:
                session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    session.commit()
    print("  ✓ Role-permission assignments done")

    print("▶ Seeding default departments...")
    for dept_data in DEFAULT_DEPARTMENTS:
        existing_dept = session.exec(
            select(Department).where(
                Department.company_id == company_id,
                Department.name == dept_data["name"],
            )
        ).first()
        if existing_dept is None:
            session.add(Department(company_id=company_id, **dept_data))
    session.commit()
    print(f"  ✓ {len(DEFAULT_DEPARTMENTS)} departments ensured")

    print("▶ Seeding demo role hierarchy (REPORTS_TO)...")
    demo_director = demo_by_name.get("demo_director")
    demo_department_head = demo_by_name.get("demo_department_head")
    demo_worker = demo_by_name.get("demo_worker")
    if demo_director and demo_department_head and demo_worker:
        pairs = [
            (demo_department_head.id, demo_director.id),
            (demo_worker.id, demo_department_head.id),
        ]
        for from_role_id, to_role_id in pairs:
            existing = session.exec(
                select(RoleDependency).where(
                    RoleDependency.company_id == company_id,
                    RoleDependency.from_role_id == from_role_id,
                    RoleDependency.to_role_id == to_role_id,
                    RoleDependency.relation_type == "REPORTS_TO",
                )
            ).first()
            if existing is None:
                session.add(
                    RoleDependency(
                        company_id=company_id,
                        from_role_id=from_role_id,
                        to_role_id=to_role_id,
                        relation_type="REPORTS_TO",
                        is_active=True,
                    )
                )
        session.commit()
        print("  ✓ Demo role dependencies ensured")

    print("▶ Ensuring first superuser has Director membership...")
    admin_user = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712
    director_role = role_by_name.get("director")
    if assign_superuser_director and admin_user and director_role:
        existing_assignment = session.exec(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == admin_user.id,
                UserCompanyRole.company_id == company_id,
                UserCompanyRole.role_id == director_role.id,
            )
        ).first()
        if existing_assignment is None:
            session.add(
                UserCompanyRole(
                    user_id=admin_user.id,
                    company_id=company_id,
                    role_id=director_role.id,
                    is_primary=True,
                )
            )
        admin_user.company_id = company_id
        session.add(admin_user)
        session.commit()
        print("  ✓ Superuser mapped as Director in company")

    print("▶ Assigning demo roles to superuser for preview...")
    if assign_superuser_demo_worker and admin_user:
        tech_department = session.exec(
            select(Department).where(
                Department.company_id == company_id,
                Department.name.in_(ADMIN_PREVIEW_DEPARTMENT_NAMES),  # type: ignore[arg-type]
            )
        ).first()
        if tech_department:
            admin_user.department_id = tech_department.id
            session.add(admin_user)
        if demo_worker:
            existing_demo = session.exec(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == admin_user.id,
                    UserCompanyRole.company_id == company_id,
                    UserCompanyRole.role_id == demo_worker.id,
                )
            ).first()
            if existing_demo is None:
                session.add(
                    UserCompanyRole(
                        user_id=admin_user.id,
                        company_id=company_id,
                        role_id=demo_worker.id,
                        is_primary=False,
                    )
                )
        session.commit()
        print("  ✓ Demo role assignment ensured")

    print("✅ Seed complete!")


def main() -> None:
    with Session(engine) as session:
        # Get or create a demo company
        company = session.exec(select(Company).where(Company.slug == "default")).first()
        if not company:
            company = Company(name="Default Company", slug="default")
            session.add(company)
            session.commit()
            session.refresh(company)
            print(f"  ✓ Created company: {company.name} ({company.id})")
        seed(session, company.id)


if __name__ == "__main__":
    main()
