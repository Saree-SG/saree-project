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
    {"name": "director", "display_name": "Giám đốc", "level": 1, "is_system": True},
    {"name": "department_head", "display_name": "Trưởng Phòng", "level": 2, "is_system": True},
    {"name": "worker", "display_name": "Thợ", "level": 3, "is_system": True},
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
        "AUDIT_VIEW", "USER_VIEW", "USER_MANAGE",
    ],
    "department_head": [
        "PROJECT_VIEW", "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS",
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE", "TASK_UPDATE_STATUS",
        "TASK_REASSIGN",
        "COMMENT_ADD", "COMMENT_DELETE_OWN",
        "PROOF_UPLOAD", "PROOF_APPROVE",
        "REPORT_VIEW_OWN", "REPORT_VIEW_TEAM",
        "USER_VIEW",
    ],
    "worker": [
        "PROJECT_VIEW",
        "TASK_VIEW", "TASK_UPDATE_STATUS",
        "COMMENT_ADD", "COMMENT_DELETE_OWN",
        "PROOF_UPLOAD",
        "REPORT_VIEW_OWN",
    ],
}


DEFAULT_DEPARTMENTS = [
    {"name": "Kế toán", "dept_type": "office_block"},
    {"name": "Kỹ thuật", "dept_type": "project_block"},
]


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

    print("▶ Ensuring first superuser has Director membership...")
    admin_user = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712
    director_role = role_by_name.get("director")
    if admin_user and director_role:
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
        print("  ✓ Superuser mapped as Director in default company")

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
