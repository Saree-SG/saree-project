"""
Destructive dev/demo reset: wipe multi-tenant org data, then seed Công ty Saree,
process-aligned roles, demo users, projects, and tasks (Quy trình Sản xuất).

Usage:
  uv run python -m app.scripts.reset_saree_process_demo --confirm

Production is blocked unless environment variable ALLOW_RESET=1 is set.

Do not run against a production database without backup.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, delete, select

from app import crud
from app.core.config import settings
from app.core.db import engine
from app.core.security import get_password_hash
from app.models.chat import ChatAttachment, ChatMember, ChatMessage, ChatRoom
from app.models.org import (
    Company,
    Department,
    ProjectMemberRole,
    Role,
    RoleDependency,
    RolePermission,
    UserCompanyRole,
    UserGlobalRole,
)
from app.models.project import Project, TaskLevelConfig
from app.models.task import (
    AuditLog,
    Task,
    TaskComment,
    TaskDependency,
    TaskObserver,
    TaskProgressReport,
)
from app.models.user import User, UserCreate
from app.scripts.seed_defaults import seed

SAREE_COMPANY_SLUG = "saree"
DEMO_PASSWORD = "SareeDemo2024!"

DEMO_USERS: list[tuple[str, str, str, str]] = [
    # Giai đoạn I: nhận yêu cầu & báo giá
    (
        "Bùi Nguyêna (Sales)",
        "sales.nguyena@saree-process.demo",
        "sales",
        "Phòng Kinh doanh",
    ),
    ("Phạm (BGĐ/BOD)", "bod.pham@saree-process.demo", "director", "Phòng Kinh doanh"),
    (
        "Trần B (Kỹ thuật)",
        "tech.tranb@saree-process.demo",
        "engineer",
        "Phòng Kỹ thuật / Thiết kế",
    ),
    (
        "Lê C (Mua hàng/Vật tư)",
        "procure.lec@saree-process.demo",
        "materials",
        "Phòng Vật tư",
    ),
    # Giai đoạn II: sản xuất nhà máy
    ("Hoàng (Kế hoạch)", "plan.hoang@saree-process.demo", "planner", "Phòng Kế hoạch"),
    (
        "Vũ (Tổ trưởng xưởng)",
        "prod.vu@saree-process.demo",
        "workshop_lead",
        "Sản xuất xưởng",
    ),
    (
        "Đặng (Cung ứng công trình)",
        "supply.dang@saree-process.demo",
        "site_supply",
        "Cung ứng vật tư công trình",
    ),
    ("KTT (Thủ kho)", "wh.ktt@saree-process.demo", "materials", "Phòng Vật tư"),
    # Giai đoạn III: lắp đặt công trình
    (
        "Ngô (Trưởng nhóm site)",
        "site.ngo@saree-process.demo",
        "installer",
        "Lắp đặt công trình",
    ),
    ("Thợ điện 1", "site.electric1@saree-process.demo", "worker", "Lắp đặt công trình"),
    ("Thợ điện 2", "site.electric2@saree-process.demo", "worker", "Lắp đặt công trình"),
    ("Thợ hàn 1", "site.welder1@saree-process.demo", "worker", "Lắp đặt công trình"),
    ("Thợ hàn 2", "site.welder2@saree-process.demo", "worker", "Lắp đặt công trình"),
    ("Thợ hàn 3", "site.welder3@saree-process.demo", "worker", "Lắp đặt công trình"),
    ("Thợ hàn 4", "site.welder4@saree-process.demo", "worker", "Lắp đặt công trình"),
]


def now_utc() -> datetime:
    """Return current UTC time with timezone."""

    return datetime.now(timezone.utc)


def parse_args() -> argparse.Namespace:
    """Parse CLI flags for the reset script."""

    parser = argparse.ArgumentParser(
        description="Reset DB demo data to Saree process seed."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required acknowledgement that this will wipe tenant data.",
    )
    return parser.parse_args()


def assert_reset_allowed() -> None:
    """Abort when production would be affected without explicit override."""

    if settings.ENVIRONMENT == "production" and os.environ.get("ALLOW_RESET") != "1":
        print(
            "Refused: ENVIRONMENT=production. Set ALLOW_RESET=1 only if you intend to wipe this DB.",
            file=sys.stderr,
        )
        sys.exit(1)


def wipe_tenant_tables(session: Session) -> None:
    """
    Delete org-scoped and task/chat rows in FK-safe order.
    Preserves Permission rows and superusers; clears AuditLog for a clean demo.
    """

    session.exec(delete(ChatAttachment))
    session.exec(delete(ChatMessage))
    session.exec(delete(ChatMember))
    session.exec(delete(ChatRoom))

    session.exec(delete(TaskProgressReport))
    session.exec(delete(TaskComment))
    session.exec(delete(TaskObserver))
    session.exec(delete(TaskDependency))
    session.exec(delete(AuditLog))
    session.exec(delete(Task))
    session.exec(delete(TaskLevelConfig))
    session.exec(delete(ProjectMemberRole))
    session.exec(delete(Project))

    session.exec(delete(UserCompanyRole))
    session.exec(delete(UserGlobalRole))
    session.exec(delete(RoleDependency))
    session.exec(delete(RolePermission))
    session.exec(delete(Role))
    session.commit()

    users = list(session.exec(select(User)).all())
    for user_row in users:
        user_row.company_id = None
        user_row.department_id = None
        session.add(user_row)
    session.commit()

    session.exec(delete(Department))
    session.exec(delete(Company))
    session.commit()

    users = list(session.exec(select(User)).all())
    for user_row in users:
        if not user_row.is_superuser:
            session.delete(user_row)
    session.commit()


def get_department_id(
    session: Session, company_id: uuid.UUID, name: str
) -> uuid.UUID | None:
    """Resolve department id by exact name within a company."""

    row = session.exec(
        select(Department).where(
            Department.company_id == company_id, Department.name == name
        )
    ).first()
    return row.id if row else None


def assign_company_role(
    session: Session,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    role_id: uuid.UUID,
    is_primary: bool,
) -> None:
    """Insert UserCompanyRole when missing."""

    existing = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
    ).first()
    if existing is None:
        session.add(
            UserCompanyRole(
                user_id=user_id,
                company_id=company_id,
                role_id=role_id,
                is_primary=is_primary,
            )
        )


def create_or_update_demo_users(
    session: Session,
    company_id: uuid.UUID,
    role_by_name: dict[str, Role],
) -> dict[str, User]:
    """
    Create demo users with fixed passwords and company role + department.
    Returns map role_name -> User for the first user holding that role.
    """

    by_role: dict[str, User] = {}
    for full_name, email, role_name, dept_name in DEMO_USERS:
        user_row = session.exec(select(User).where(User.email == email)).first()
        if user_row is None:
            user_row = crud.create_user(
                session=session,
                user_create=UserCreate(
                    email=email,
                    password=DEMO_PASSWORD,
                    is_active=True,
                    is_superuser=False,
                    full_name=full_name,
                ),
            )
        else:
            user_row.full_name = full_name
            user_row.is_active = True
            user_row.company_id = company_id
            user_row.hashed_password = get_password_hash(DEMO_PASSWORD)
            session.add(user_row)
            session.commit()
            session.refresh(user_row)

        dept_id = get_department_id(session, company_id, dept_name)
        user_row.company_id = company_id
        user_row.department_id = dept_id
        session.add(user_row)

        role_obj = role_by_name.get(role_name)
        if role_obj:
            assign_company_role(
                session, user_row.id, company_id, role_obj.id, is_primary=True
            )
            if role_name not in by_role:
                by_role[role_name] = user_row

    session.commit()
    return by_role


def seed_projects_and_tasks(
    session: Session,
    company_id: uuid.UUID,
    director_user: User,
    users_by_role: dict[str, User],
) -> dict[str, Any]:
    """
    Create three sample projects (báo giá, sản xuất, lắp đặt) and a compact WBS
    aligned with Document/Quy_trình.txt.
    """

    role_rows = session.exec(select(Role).where(Role.company_id == company_id)).all()
    role_by_name = {r.name: r for r in role_rows}

    def uid_for(role_name: str) -> uuid.UUID:
        u = users_by_role.get(role_name)
        if u:
            return u.id
        return director_user.id

    today = date.today()
    specs: list[tuple[str, str, str, str]] = [
        (
            "Dự án mẫu – Giai đoạn báo giá",
            "BAO-GIA-001",
            "Theo quy trình I: nhận yêu cầu → thiết kế → vật tư → chào giá.",
            "active",
        ),
        (
            "Dự án mẫu – Sản xuất tại nhà máy",
            "SX-NHM-001",
            "Theo quy trình II: hợp đồng, kế hoạch, tổ SX, vật tư, cung ứng công trình.",
            "active",
        ),
        (
            "Dự án mẫu – Lắp đặt công trình",
            "LAP-DAT-001",
            "Theo quy trình III: tổ thi công, tiến độ, phụ thuộc công việc.",
            "active",
        ),
    ]

    projects: list[Project] = []
    director_role = role_by_name["director"]
    for name, code, description, status in specs:
        project_row = Project(
            company_id=company_id,
            name=name,
            code=code,
            description=description,
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=120),
            status=status,
            pm_id=director_user.id,
            created_by=director_user.id,
        )
        session.add(project_row)
        session.flush()
        projects.append(project_row)
        session.add(
            ProjectMemberRole(
                project_id=project_row.id,
                user_id=director_user.id,
                role_id=director_role.id,
            )
        )
        for role_key, user_obj in users_by_role.items():
            rr = role_by_name.get(role_key)
            if rr and user_obj.id != director_user.id:
                session.add(
                    ProjectMemberRole(
                        project_id=project_row.id,
                        user_id=user_obj.id,
                        role_id=rr.id,
                    )
                )
    session.commit()

    t0 = now_utc()
    task_count = 0

    def add_task(
        project: Project,
        name: str,
        description: str,
        assignee_role: str,
        start: datetime,
        end: datetime,
        status: str,
        parent_id: uuid.UUID | None,
        level: int,
    ) -> Task:
        nonlocal task_count
        assignee_id = uid_for(assignee_role)
        task_row = Task(
            project_id=project.id,
            parent_id=parent_id,
            level=level,
            name=name,
            description=description,
            priority="medium",
            start_time=start,
            end_time=end,
            status=status,
            assignor_id=director_user.id,
            assignee_id=assignee_id,
            is_on_critical_path=False,
        )
        session.add(task_row)
        session.flush()
        task_count += 1
        return task_row

    p_bg, p_sx, p_ld = projects[0], projects[1], projects[2]

    s1 = t0 - timedelta(days=20)
    h1 = add_task(
        p_bg,
        "I/ Nhận yêu cầu báo giá",
        "Thu thập thông tin, khảo sát, báo cáo BGD.",
        "sales",
        s1,
        s1 + timedelta(days=14),
        "in_progress",
        None,
        0,
    )
    add_task(
        p_bg,
        "Gọi điện / khảo sát hiện trường",
        "Lấy số liệu cho thiết kế.",
        "sales",
        s1,
        s1 + timedelta(days=5),
        "done",
        h1.id,
        1,
    )
    t_b = add_task(
        p_bg,
        "Báo cáo BGD phê duyệt chuyển thiết kế",
        "",
        "sales",
        s1 + timedelta(days=5),
        s1 + timedelta(days=10),
        "in_progress",
        h1.id,
        1,
    )
    h2 = add_task(
        p_bg,
        "II/ Thiết kế & bảng chào giá khung",
        "Thiết kế hệ thống, khung thông số chưa đơn giá.",
        "engineer",
        s1 + timedelta(days=8),
        s1 + timedelta(days=28),
        "todo",
        None,
        0,
    )
    add_task(
        p_bg,
        "Thiết kế theo số liệu khảo sát",
        "",
        "engineer",
        s1 + timedelta(days=8),
        s1 + timedelta(days=20),
        "todo",
        h2.id,
        1,
    )
    t_frame = add_task(
        p_bg,
        "Bảng chào giá khung (chưa đơn giá)",
        "Chuyển vật tư tính giá.",
        "engineer",
        s1 + timedelta(days=18),
        s1 + timedelta(days=26),
        "todo",
        h2.id,
        1,
    )
    h3 = add_task(
        p_bg,
        "III/ Vật tư – đơn giá mua",
        "Kiểm tra đơn giá từng hạng mục.",
        "materials",
        s1 + timedelta(days=22),
        s1 + timedelta(days=35),
        "todo",
        None,
        0,
    )
    t_mat = add_task(
        p_bg,
        "Điền đơn giá vào bảng chào giá",
        "",
        "materials",
        s1 + timedelta(days=24),
        s1 + timedelta(days=32),
        "todo",
        h3.id,
        1,
    )
    h4 = add_task(
        p_bg,
        "IV/ KD – chào giá cuối & gửi khách",
        "Hệ số giá, trình BGD, gửi KH, theo dõi phản hồi.",
        "sales",
        s1 + timedelta(days=30),
        s1 + timedelta(days=45),
        "todo",
        None,
        0,
    )
    add_task(
        p_bg,
        "Hoàn chỉnh bảng chào giá & trình BGD",
        "",
        "sales",
        s1 + timedelta(days=32),
        s1 + timedelta(days=40),
        "todo",
        h4.id,
        1,
    )

    session.add(
        TaskDependency(
            blocking_task_id=t_b.id,
            dependent_task_id=h2.id,
            dependency_type="FS",
            lag_hours=0,
        )
    )
    session.add(
        TaskDependency(
            blocking_task_id=t_frame.id,
            dependent_task_id=t_mat.id,
            dependency_type="FS",
            lag_hours=0,
        )
    )

    s2 = t0 - timedelta(days=10)
    hx1 = add_task(
        p_sx,
        "Hợp đồng & bản vẽ gửi khách",
        "KD hợp đồng; KT hiệu chỉnh bản vẽ.",
        "sales",
        s2,
        s2 + timedelta(days=10),
        "in_progress",
        None,
        0,
    )
    add_task(
        p_sx,
        "Xác nhận ký hợp đồng & tạm ứng đợt 1",
        "",
        "sales",
        s2 + timedelta(days=4),
        s2 + timedelta(days=12),
        "todo",
        hx1.id,
        1,
    )
    hx2 = add_task(
        p_sx,
        "Kế hoạch sản xuất tổ",
        "Phân bổ thời gian, điều phối nhân sự.",
        "planner",
        s2 + timedelta(days=8),
        s2 + timedelta(days=25),
        "todo",
        None,
        0,
    )
    add_task(
        p_sx,
        "Phát hành bản vẽ chi tiết cho tổ",
        "",
        "engineer",
        s2 + timedelta(days=6),
        s2 + timedelta(days=18),
        "todo",
        hx2.id,
        1,
    )
    add_task(
        p_sx,
        "Triển khai chế tạo theo tổ",
        "Tổ trưởng điều phối tổ viên.",
        "workshop_lead",
        s2 + timedelta(days=14),
        s2 + timedelta(days=45),
        "todo",
        None,
        0,
    )
    add_task(
        p_sx,
        "Đặt hàng vật tư – nhập kho – thông báo tổ",
        "",
        "materials",
        s2 + timedelta(days=10),
        s2 + timedelta(days=35),
        "todo",
        None,
        0,
    )
    add_task(
        p_sx,
        "Kế hoạch vận chuyển thiết bị ra công trình",
        "",
        "site_supply",
        s2 + timedelta(days=30),
        s2 + timedelta(days=50),
        "todo",
        None,
        0,
    )

    s3 = t0 - timedelta(days=5)
    hl1 = add_task(
        p_ld,
        "Lắp đặt – nhóm điện",
        "Điện công nghiệp.",
        "installer",
        s3,
        s3 + timedelta(days=14),
        "todo",
        None,
        0,
    )
    hl2 = add_task(
        p_ld,
        "Lắp đặt – nhóm hàn / kết nối ống",
        "",
        "installer",
        s3 + timedelta(days=10),
        s3 + timedelta(days=24),
        "todo",
        None,
        0,
    )
    add_task(
        p_ld,
        "Lắp đặt băng chuyền IQF (cân chỉnh)",
        "",
        "installer",
        s3 + timedelta(days=18),
        s3 + timedelta(days=35),
        "todo",
        None,
        0,
    )
    add_task(
        p_ld,
        "Báo cáo tiến độ & ảnh hiện trường hàng ngày",
        "",
        "installer",
        s3,
        s3 + timedelta(days=40),
        "in_progress",
        None,
        0,
    )
    session.add(
        TaskDependency(
            blocking_task_id=hl1.id,
            dependent_task_id=hl2.id,
            dependency_type="FS",
            lag_hours=0,
        )
    )

    session.commit()
    return {
        "projects": len(projects),
        "tasks": task_count,
        "company_id": str(company_id),
    }


def main() -> None:
    """CLI entry: wipe, create Saree company, seed RBAC, users, projects, tasks."""

    args = parse_args()
    if not args.confirm:
        print("Refused: pass --confirm to wipe tenant data.", file=sys.stderr)
        sys.exit(1)
    assert_reset_allowed()

    with Session(engine) as session:
        print("▶ Wiping tenant tables…")
        wipe_tenant_tables(session)
        print("  ✓ Wipe complete")

        company_row = Company(name="Công ty Saree", slug=SAREE_COMPANY_SLUG)
        session.add(company_row)
        session.commit()
        session.refresh(company_row)
        print(f"  ✓ Company {company_row.name} ({company_row.id})")

        seed(
            session,
            company_row.id,
            assign_superuser_director=True,
            assign_superuser_demo_worker=True,
        )

        role_rows = session.exec(
            select(Role).where(Role.company_id == company_row.id)
        ).all()
        role_by_name = {r.name: r for r in role_rows}

        director_demo = session.exec(
            select(User).where(User.email == "bod.pham@saree-process.demo")
        ).first()
        superuser_row = session.exec(select(User).where(User.is_superuser)).first()
        director_user = director_demo or superuser_row
        if director_user is None:
            raise RuntimeError("No director demo user and no superuser after seed.")

        users_by_role = create_or_update_demo_users(
            session, company_row.id, role_by_name
        )
        users_by_role["director"] = director_user

        summary = seed_projects_and_tasks(
            session, company_row.id, director_user, users_by_role
        )

        print("✅ Saree process demo reset complete.")
        print(f"   Projects: {summary['projects']}, tasks: {summary['tasks']}")
        print(f"   Demo password (all demo users): {DEMO_PASSWORD}")
        print("   Emails: see DEMO_USERS in reset_saree_process_demo.py")


if __name__ == "__main__":
    main()
