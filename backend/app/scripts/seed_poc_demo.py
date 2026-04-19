"""
POC Demo seed — tạo data mẫu tập trung cho demo khách hàng.

Script này KHÔNG xóa data cũ — chỉ thêm nếu chưa có (idempotent).

Usage:
    uv run python -m app.scripts.seed_poc_demo
    docker compose exec backend python -m app.scripts.seed_poc_demo

Accounts tạo ra (password: Demo2024!):
    gd@saree.demo          — Giám đốc (Phạm Văn Giám)
    totruong@saree.demo    — Tổ trưởng Lắp đặt (Nguyễn Văn Trưởng)
    tho.dien@saree.demo    — Thợ Điện (Trần Văn Điện)
    tho.han@saree.demo     — Thợ Hàn (Lê Văn Hàn)
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app import crud
from app.core.db import engine
from app.core.security import get_password_hash
from app.models.org import (
    Company,
    Department,
    ProjectMemberRole,
    Role,
    UserCompanyRole,
)
from app.models.project import Project, TaskLevelConfig
from app.models.task import Task
from app.models.user import User, UserCreate
from app.scripts.seed_defaults import seed as seed_defaults

POC_COMPANY_SLUG = "saree-poc"
DEMO_PASSWORD = "Demo2024!"

POC_USERS = [
    ("Phạm Văn Giám", "gd@saree.demo", "director", "Phòng Kinh doanh"),
    ("Nguyễn Văn Trưởng", "totruong@saree.demo", "workshop_lead", "Lắp đặt công trình"),
    ("Trần Văn Điện", "tho.dien@saree.demo", "worker", "Lắp đặt công trình"),
    ("Lê Văn Hàn", "tho.han@saree.demo", "worker", "Lắp đặt công trình"),
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_or_create_company(session: Session) -> Company:
    company = session.exec(
        select(Company).where(Company.slug == POC_COMPANY_SLUG)
    ).first()
    if company:
        print(f"  ✓ Company tồn tại: {company.name}")
        return company
    company = Company(name="Công ty SAREE (POC Demo)", slug=POC_COMPANY_SLUG)
    session.add(company)
    session.commit()
    session.refresh(company)
    print(f"  ✓ Tạo company: {company.name}")
    return company


def get_or_create_user(
    session: Session,
    full_name: str,
    email: str,
    company_id: uuid.UUID,
) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        user.full_name = full_name
        user.hashed_password = get_password_hash(DEMO_PASSWORD)
        user.is_active = True
        user.company_id = company_id
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    user = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=email,
            password=DEMO_PASSWORD,
            is_active=True,
            is_superuser=False,
            full_name=full_name,
        ),
    )
    user.company_id = company_id
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def assign_role(
    session: Session,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    role_id: uuid.UUID,
    is_primary: bool = True,
) -> None:
    existing = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
    ).first()
    if not existing:
        session.add(
            UserCompanyRole(
                user_id=user_id,
                company_id=company_id,
                role_id=role_id,
                is_primary=is_primary,
            )
        )


def add_project_member(
    session: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role_id: uuid.UUID,
) -> None:
    existing = session.exec(
        select(ProjectMemberRole).where(
            ProjectMemberRole.project_id == project_id,
            ProjectMemberRole.user_id == user_id,
        )
    ).first()
    if not existing:
        session.add(
            ProjectMemberRole(
                project_id=project_id,
                user_id=user_id,
                role_id=role_id,
            )
        )


def seed_poc(session: Session) -> None:
    # 1. Company
    print("\n▶ Tạo company POC Demo...")
    company = get_or_create_company(session)

    # 2. Seed roles + permissions + departments (idempotent)
    print("▶ Seed roles & permissions...")
    seed_defaults(
        session,
        company.id,
        assign_superuser_director=False,
        assign_superuser_demo_worker=False,
    )

    role_by_name = {
        r.name: r
        for r in session.exec(
            select(Role).where(Role.company_id == company.id)
        ).all()
    }
    dept_by_name = {
        d.name: d
        for d in session.exec(
            select(Department).where(Department.company_id == company.id)
        ).all()
    }

    # 3. Users
    print("▶ Tạo demo users...")
    user_map: dict[str, User] = {}
    for full_name, email, role_name, dept_name in POC_USERS:
        user = get_or_create_user(session, full_name, email, company.id)
        dept = dept_by_name.get(dept_name)
        if dept:
            user.department_id = dept.id
            session.add(user)
        role = role_by_name.get(role_name)
        if role:
            assign_role(session, user.id, company.id, role.id, is_primary=True)
        user_map[email] = user
        print(f"  ✓ {full_name} <{email}> [{role_name}]")
    session.commit()

    director = user_map["gd@saree.demo"]
    totruong = user_map["totruong@saree.demo"]
    tho_dien = user_map["tho.dien@saree.demo"]
    tho_han = user_map["tho.han@saree.demo"]

    # 4. Project
    print("▶ Tạo project demo...")
    project = session.exec(
        select(Project).where(
            Project.company_id == company.id,
            Project.code == "POC-001",
        )
    ).first()
    if not project:
        from datetime import date
        project = Project(
            company_id=company.id,
            name="Lắp đặt hệ thống kho lạnh - Khách hàng ABC",
            code="POC-001",
            description=(
                "Dự án demo POC: Lắp đặt hệ thống kho lạnh công nghiệp "
                "cho nhà máy chế biến thủy sản ABC tại Bình Dương."
            ),
            start_date=date.today() - timedelta(days=10),
            end_date=date.today() + timedelta(days=60),
            status="active",
            pm_id=director.id,
            created_by=director.id,
        )
        session.add(project)
        session.flush()
        print(f"  ✓ Tạo project: {project.name}")
    else:
        print(f"  ✓ Project tồn tại: {project.name}")

    # 4b. Task level configs
    for lvl, label, requires_proof, can_have_children in [
        (0, "Đầu việc chính", False, True),
        (1, "Hạng mục", False, True),
        (2, "Công việc", True, False),
    ]:
        existing_lvl = session.exec(
            select(TaskLevelConfig).where(
                TaskLevelConfig.project_id == project.id,
                TaskLevelConfig.level == lvl,
            )
        ).first()
        if not existing_lvl:
            session.add(
                TaskLevelConfig(
                    project_id=project.id,
                    level=lvl,
                    label=label,
                    requires_proof=requires_proof,
                    can_have_children=can_have_children,
                )
            )

    # 4c. Project members
    director_role = role_by_name.get("director")
    workshop_lead_role = role_by_name.get("workshop_lead")
    worker_role = role_by_name.get("worker")

    if director_role:
        add_project_member(session, project.id, director.id, director_role.id)
    if workshop_lead_role:
        add_project_member(session, project.id, totruong.id, workshop_lead_role.id)
    if worker_role:
        add_project_member(session, project.id, tho_dien.id, worker_role.id)
        add_project_member(session, project.id, tho_han.id, worker_role.id)
    session.commit()
    print("  ✓ Thêm 4 thành viên vào project")

    # 5. Task tree
    print("▶ Tạo task tree...")
    existing_root = session.exec(
        select(Task).where(
            Task.project_id == project.id,
            Task.parent_id == None,  # noqa: E711
            Task.level == 0,
        )
    ).first()

    if existing_root:
        print("  ✓ Tasks đã tồn tại, bỏ qua")
        session.commit()
        _print_summary(director, totruong, tho_dien, tho_han)
        return

    t0 = now_utc()

    # Root task
    root = Task(
        project_id=project.id,
        parent_id=None,
        level=0,
        name="Lắp đặt hệ thống kho lạnh",
        description="Đầu việc chính bao gồm toàn bộ hạng mục lắp đặt.",
        priority="high",
        start_time=t0 - timedelta(days=10),
        end_time=t0 + timedelta(days=50),
        status="in_progress",
        assignor_id=director.id,
        assignee_id=totruong.id,
        is_on_critical_path=True,
    )
    session.add(root)
    session.flush()

    # Subtask 1 — OVERDUE (để demo highlight đỏ)
    sub1 = Task(
        project_id=project.id,
        parent_id=root.id,
        level=1,
        name="Lắp đường ống lạnh",
        description=(
            "Kết nối đường ống đồng dẫn gas lạnh giữa các thiết bị. "
            "Hàn bạc tại các mối nối. Kiểm tra độ kín bằng nitơ áp suất."
        ),
        priority="critical",
        start_time=t0 - timedelta(days=8),
        end_time=t0 - timedelta(days=1),   # deadline HÔM QUA → overdue
        status="in_progress",
        assignor_id=totruong.id,
        assignee_id=tho_han.id,
        is_on_critical_path=True,
    )
    session.add(sub1)
    session.flush()

    # Subtask 2
    sub2 = Task(
        project_id=project.id,
        parent_id=root.id,
        level=1,
        name="Lắp hệ thống điện",
        description=(
            "Đi dây điện động lực, điều khiển. Lắp tủ điện, CB, contactor. "
            "Đấu nối cảm biến nhiệt độ."
        ),
        priority="high",
        start_time=t0 + timedelta(days=2),
        end_time=t0 + timedelta(days=15),
        status="todo",
        assignor_id=totruong.id,
        assignee_id=tho_dien.id,
        is_on_critical_path=True,
    )
    session.add(sub2)
    session.flush()

    # Subtask 3 — phụ thuộc sub1 + sub2
    sub3 = Task(
        project_id=project.id,
        parent_id=root.id,
        level=1,
        name="Kiểm tra & nghiệm thu hệ thống",
        description=(
            "Chạy thử hệ thống, kiểm tra nhiệt độ đạt yêu cầu. "
            "Lập biên bản nghiệm thu với khách hàng."
        ),
        priority="high",
        start_time=t0 + timedelta(days=16),
        end_time=t0 + timedelta(days=25),
        status="todo",
        assignor_id=director.id,
        assignee_id=totruong.id,
        is_on_critical_path=True,
    )
    session.add(sub3)
    session.flush()

    session.commit()
    print(f"  ✓ Tạo 1 root task + 3 subtasks (task '{sub1.name}' đang OVERDUE)")

    _print_summary(director, totruong, tho_dien, tho_han)


def _print_summary(
    director: User,
    totruong: User,
    tho_dien: User,
    tho_han: User,
) -> None:
    print("\n" + "=" * 60)
    print("✅ POC Demo seed hoàn tất!")
    print(f"   Password tất cả accounts: {DEMO_PASSWORD}")
    print()
    print("   Accounts demo:")
    print(f"   [Giám đốc]    {director.email}")
    print(f"   [Tổ trưởng]   {totruong.email}")
    print(f"   [Thợ Điện]    {tho_dien.email}")
    print(f"   [Thợ Hàn]     {tho_han.email}")
    print()
    print("   Thứ tự demo:")
    print("   1. Login Giám đốc → xem Dashboard KPI")
    print("   2. Vào project 'Lắp đặt hệ thống kho lạnh - Khách hàng ABC'")
    print("   3. Thấy task 'Lắp đường ống' màu ĐỎ (overdue)")
    print("   4. Switch Thợ Hàn → upload ảnh tiến độ + submit proof")
    print("   5. Switch Tổ trưởng → duyệt proof → xin gia hạn")
    print("   6. Switch Giám đốc → duyệt gia hạn → chat nhóm dự án")
    print("=" * 60)


def main() -> None:
    print("🚀 Saree POC Demo Seed")
    print(f"   Company slug : {POC_COMPANY_SLUG}")
    print(f"   Password     : {DEMO_PASSWORD}")

    with Session(engine) as session:
        try:
            seed_poc(session)
        except Exception as exc:
            print(f"\n❌ Lỗi: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
