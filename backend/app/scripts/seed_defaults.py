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
from app.models.org import Company, Permission, Role, RolePermission


# ---------------------------------------------------------------------------
# Default data
# ---------------------------------------------------------------------------

SYSTEM_ROLES = [
    {"name": "admin",     "display_name": "System Admin",   "level": 1, "is_system": True},
    {"name": "director",  "display_name": "Giám đốc",       "level": 1, "is_system": True},
    {"name": "manager",   "display_name": "Quản lý",        "level": 2, "is_system": True},
    {"name": "leader",    "display_name": "Tổ trưởng",      "level": 2, "is_system": True},
    {"name": "worker",    "display_name": "Nhân viên/Thợ",  "level": 3, "is_system": True},
    {"name": "observer",  "display_name": "Người theo dõi", "level": 3, "is_system": True},
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
]
# fmt: on

# Role → list of permission codes they receive
ROLE_PERMISSION_MAP: dict[str, list[str]] = {
    "admin": [p["code"] for p in ALL_PERMISSIONS],  # admin gets ALL
    "director": [
        "PROJECT_VIEW", "PROJECT_VIEW_ALL", "PROJECT_CREATE", "PROJECT_UPDATE",
        "PROJECT_MANAGE_MEMBERS",
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
        "TASK_REASSIGN",
        "COMMENT_ADD", "COMMENT_DELETE_ANY",
        "PROOF_UPLOAD", "PROOF_APPROVE",
        "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM", "REPORT_VIEW_ALL",
        "AUDIT_VIEW", "USER_VIEW",
    ],
    "manager": [
        "PROJECT_VIEW", "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS",
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
        "TASK_REASSIGN",
        "COMMENT_ADD", "COMMENT_DELETE_OWN",
        "PROOF_UPLOAD", "PROOF_APPROVE",
        "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM",
        "USER_VIEW",
    ],
    "leader": [
        "PROJECT_VIEW",
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
        "COMMENT_ADD", "COMMENT_DELETE_OWN",
        "PROOF_UPLOAD", "PROOF_APPROVE",
        "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM",
    ],
    "worker": [
        "PROJECT_VIEW",
        "TASK_VIEW", "TASK_UPDATE_STATUS",
        "COMMENT_ADD", "COMMENT_DELETE_OWN",
        "PROOF_UPLOAD",
        "REPORT_VIEW_OWN",
    ],
    "observer": [
        "PROJECT_VIEW", "TASK_VIEW",
        "REPORT_VIEW_OWN",
    ],
}


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

def seed(session: Session, company_id: uuid.UUID) -> None:
    """Idempotent seed — safe to run multiple times."""

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
    for r_data in SYSTEM_ROLES:
        existing = session.exec(
            select(Role).where(Role.name == r_data["name"], Role.company_id == company_id)
        ).first()
        if existing:
            role_by_name[r_data["name"]] = existing
        else:
            role = Role(**r_data, company_id=company_id)
            session.add(role)
            session.flush()
            role_by_name[r_data["name"]] = role
    print(f"  ✓ {len(SYSTEM_ROLES)} roles ensured")

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
