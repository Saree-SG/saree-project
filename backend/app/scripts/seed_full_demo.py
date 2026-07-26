"""
Full demo seed — thêm nhiều nhân viên, công trình, task, kỹ năng để test.

Idempotent: chạy nhiều lần không bị duplicate.
Chạy SAU khi đã seed_poc_demo (cần company, roles, skills tồn tại).

Usage:
    uv run python -m app.scripts.seed_full_demo
"""
from __future__ import annotations

import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app import crud
from app.core.db import engine
from app.core.security import get_password_hash
from app.models.org import Company, Department, ProjectMemberRole, Role, UserCompanyRole
from app.models.project import Project, TaskLevelConfig
from app.models.skill import Skill, UserSkill
from app.models.task import Task, TaskAssignee
from app.models.user import User, UserCreate
from app.scripts.seed_defaults import seed as seed_defaults
from app.scripts.seed_skills import seed_skills_for_company

DEMO_PASSWORD = "Demo2024!"
POC_COMPANY_SLUG = "saree-poc"

random.seed(42)

# ---------------------------------------------------------------------------
# Nhân viên mới (thêm vào POC company)
# ---------------------------------------------------------------------------
EXTRA_USERS = [
    ("Nguyễn Minh Khoa",   "khoa@saree.demo",    "worker",       "Tổ Điện"),
    ("Trần Thị Lan",       "lan@saree.demo",      "worker",       "Tổ IQF"),
    ("Phạm Văn Bình",      "binh@saree.demo",     "worker",       "Tổ Máy"),
    ("Lê Văn Cường",       "cuong@saree.demo",    "worker",       "Tổ Điện"),
    ("Hoàng Thị Mai",      "mai@saree.demo",      "worker",       "Tổ IQF"),
    ("Vũ Đình Tuấn",       "tuan@saree.demo",     "worker",       "Tổ Máy"),
    ("Đặng Văn Thắng",     "thang@saree.demo",    "workshop_lead","Tổ Điện"),
    ("Bùi Thị Hoa",        "hoa@saree.demo",      "worker",       "Tổ IQF"),
    ("Ngô Xuân Hùng",      "hung@saree.demo",     "worker",       "Tổ Máy"),
    ("Phan Thị Nhung",     "nhung@saree.demo",    "workshop_lead","Tổ IQF"),
    ("Trịnh Văn Đức",      "duc@saree.demo",      "worker",       "Lắp đặt công trình"),
    ("Lý Văn Sơn",         "son@saree.demo",      "worker",       "Lắp đặt công trình"),
]

# ---------------------------------------------------------------------------
# Công trình mới — tọa độ quanh khu vực TP.HCM / Long An / Bình Dương
# ---------------------------------------------------------------------------
EXTRA_PROJECTS = [
    {
        "code": "SAR-002",
        "name": "Kho lạnh thủy sản Cần Giờ",
        "description": "Lắp hệ thống kho lạnh 3.000 tấn tại Cần Giờ, TP.HCM.",
        "status": "active",
        "site_lat": 10.4114, "site_lng": 106.9574,
        "days_start": -20, "days_end": 40,
        "pct": 42,
    },
    {
        "code": "SAR-003",
        "name": "Nhà máy thực phẩm Bình Dương",
        "description": "Hệ thống lạnh IQF cho nhà máy chế biến tại Bình Dương.",
        "status": "active",
        "site_lat": 11.0167, "site_lng": 106.6667,
        "days_start": -5, "days_end": 80,
        "pct": 15,
    },
    {
        "code": "SAR-004",
        "name": "Sửa chữa máy nén Long An",
        "description": "Bảo trì định kỳ + thay thế máy nén trục vít tại Long An.",
        "status": "active",
        "site_lat": 10.5354, "site_lng": 106.4100,
        "days_start": -2, "days_end": 14,
        "pct": 10,
    },
    {
        "code": "SAR-005",
        "name": "Lắp điện nhà máy Đồng Nai",
        "description": "Hệ thống điện công nghiệp & tủ điều khiển PLC.",
        "status": "active",
        "site_lat": 10.9458, "site_lng": 106.8243,
        "days_start": -30, "days_end": -5,
        "pct": 90,
    },
    {
        "code": "SAR-006",
        "name": "Panel kho lạnh Tây Ninh",
        "description": "Cung cấp và lắp đặt panel cách nhiệt kho lạnh 1.000 tấn.",
        "status": "planning",
        "site_lat": 11.3100, "site_lng": 106.0983,
        "days_start": 7, "days_end": 60,
        "pct": 0,
    },
]

# ---------------------------------------------------------------------------
# Mapping skill name → category (một phần, dùng khi gán kỹ năng user)
# ---------------------------------------------------------------------------
SKILL_GROUPS = {
    "Tổ Điện":            ["Hệ thống điện công nghiệp", "Điện điều khiển PLC", "Hệ thống điện nhẹ", "An toàn lao động"],
    "Tổ IQF":             ["Lắp đặt IQF", "Hệ thống lạnh công nghiệp", "Bọc cách nhiệt", "An toàn lao động"],
    "Tổ Máy":             ["Hàn MIG/TIG", "Gia công cơ khí", "Lắp đặt kết cấu thép", "Bảo trì định kỳ"],
    "Lắp đặt công trình": ["Đường ống môi chất lạnh", "Hệ thống lạnh công nghiệp", "Lắp panel cách nhiệt", "Đọc bản vẽ kỹ thuật"],
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_or_create_user(session: Session, full_name: str, email: str, company_id: uuid.UUID) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        user.full_name = full_name
        user.company_id = company_id
        user.hashed_password = get_password_hash(DEMO_PASSWORD)
        session.add(user)
        return user
    user = crud.create_user(
        session=session,
        user_create=UserCreate(email=email, password=DEMO_PASSWORD, is_active=True,
                               is_superuser=False, full_name=full_name),
    )
    user.company_id = company_id
    session.add(user)
    return user


def assign_role(session: Session, user_id: uuid.UUID, company_id: uuid.UUID, role_id: uuid.UUID) -> None:
    existing = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
    ).first()
    if not existing:
        session.add(UserCompanyRole(user_id=user_id, company_id=company_id,
                                    role_id=role_id, is_primary=True))


def add_project_member(session: Session, project_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID) -> None:
    existing = session.exec(
        select(ProjectMemberRole).where(
            ProjectMemberRole.project_id == project_id,
            ProjectMemberRole.user_id == user_id,
        )
    ).first()
    if not existing:
        session.add(ProjectMemberRole(project_id=project_id, user_id=user_id, role_id=role_id))


def get_or_create_dept(session: Session, company_id: uuid.UUID, name: str) -> Department:
    dept = session.exec(
        select(Department).where(Department.company_id == company_id, Department.name == name)
    ).first()
    if dept:
        return dept
    dept = Department(company_id=company_id, name=name)
    session.add(dept)
    session.flush()
    return dept


def seed(session: Session) -> None:
    # 0. Tìm company
    company = session.exec(select(Company).where(Company.slug == POC_COMPANY_SLUG)).first()
    if not company:
        print("❌ Không tìm thấy company POC. Hãy chạy seed_poc_demo trước.", file=sys.stderr)
        sys.exit(1)

    print(f"▶ Company: {company.name}")

    # 1. Seed skills nếu chưa có
    created_skills = seed_skills_for_company(session, company)
    if created_skills:
        print(f"  ✓ Tạo {created_skills} kỹ năng")
    else:
        print("  — Skills đã có")

    # 2. Seed roles & depts nếu chưa đủ
    seed_defaults(session, company.id, assign_superuser_director=False, assign_superuser_demo_worker=False)

    role_by_name: dict[str, Role] = {
        r.name: r for r in session.exec(select(Role).where(Role.company_id == company.id)).all()
    }
    worker_role = role_by_name.get("worker")
    lead_role = role_by_name.get("workshop_lead")
    director_role = role_by_name.get("director")

    # 3. Đảm bảo tổ/phòng tồn tại
    dept_names = set(dept for _, _, _, dept in EXTRA_USERS) | {"Phòng Kinh doanh", "Lắp đặt công trình"}
    dept_by_name: dict[str, Department] = {}
    for dn in dept_names:
        dept_by_name[dn] = get_or_create_dept(session, company.id, dn)
    session.flush()

    # 4. Tạo nhân viên mới
    print("▶ Tạo nhân viên bổ sung...")
    user_map: dict[str, User] = {}
    for full_name, email, role_name, dept_name in EXTRA_USERS:
        user = get_or_create_user(session, full_name, email, company.id)
        dept = dept_by_name.get(dept_name)
        if dept:
            user.department_id = dept.id
            session.add(user)
        role = role_by_name.get(role_name)
        if role:
            session.flush()
            assign_role(session, user.id, company.id, role.id)
        user_map[email] = user
        print(f"  ✓ {full_name} [{role_name} / {dept_name}]")
    session.flush()

    # Lấy các user cũ từ seed_poc
    existing_users: dict[str, User] = {
        u.email: u for u in session.exec(
            select(User).where(User.company_id == company.id)
        ).all()
    }
    all_users = list(existing_users.values())
    workers = [u for u in all_users if u.email != "gd@saree.demo"]

    # 5. Gán kỹ năng cho nhân viên
    print("▶ Gán kỹ năng...")
    skill_by_name: dict[str, Skill] = {
        s.name: s for s in session.exec(select(Skill).where(Skill.company_id == company.id)).all()
    }

    for full_name, email, _, dept_name in EXTRA_USERS:
        user = user_map.get(email)
        if not user:
            continue
        skill_names = SKILL_GROUPS.get(dept_name, [])
        for sname in skill_names:
            skill = skill_by_name.get(sname)
            if not skill:
                continue
            exists = session.exec(
                select(UserSkill).where(
                    UserSkill.user_id == user.id,
                    UserSkill.skill_id == skill.id,
                    UserSkill.company_id == company.id,
                )
            ).first()
            if not exists:
                session.add(UserSkill(
                    user_id=user.id,
                    skill_id=skill.id,
                    company_id=company.id,
                    level=random.randint(2, 5),
                ))
    session.flush()

    # 6. Tạo dự án
    print("▶ Tạo công trình...")
    today = date.today()
    director = existing_users.get("gd@saree.demo")
    totruong = existing_users.get("totruong@saree.demo")

    project_map: dict[str, Project] = {}
    for p_data in EXTRA_PROJECTS:
        proj = session.exec(
            select(Project).where(Project.company_id == company.id, Project.code == p_data["code"])
        ).first()
        if not proj:
            proj = Project(
                company_id=company.id,
                name=p_data["name"],
                code=p_data["code"],
                description=p_data["description"],
                status=p_data["status"],
                site_lat=p_data["site_lat"],
                site_lng=p_data["site_lng"],
                start_date=today + timedelta(days=p_data["days_start"]),
                end_date=today + timedelta(days=p_data["days_end"]),
                pm_id=director.id if director else None,
                created_by=director.id if director else None,
            )
            session.add(proj)
            session.flush()
            print(f"  ✓ Tạo: {proj.name}")

            # Task level configs
            for lvl, label, proof, children in [
                (0, "Đầu việc chính", False, True),
                (1, "Hạng mục", False, True),
                (2, "Công việc", True, False),
            ]:
                session.add(TaskLevelConfig(
                    project_id=proj.id, level=lvl, label=label,
                    requires_proof=proof, can_have_children=children,
                ))
        else:
            print(f"  — Đã có: {proj.name}")

        project_map[p_data["code"]] = proj

    session.flush()

    # Project members — thêm 3-5 workers ngẫu nhiên vào mỗi project
    if director_role and worker_role and workers:
        for code, proj in project_map.items():
            if director:
                add_project_member(session, proj.id, director.id, director_role.id)
            chosen = random.sample(workers, min(4, len(workers)))
            for w in chosen:
                role = lead_role if w.email.endswith("thang@saree.demo") or w.email.endswith("nhung@saree.demo") else worker_role
                add_project_member(session, proj.id, w.id, role.id)
    session.flush()

    # 7. Tạo tasks cho các project mới
    print("▶ Tạo tasks...")
    _create_tasks_for_project(session, project_map, existing_users, worker_role, director)

    session.commit()

    print("\n" + "=" * 60)
    print("✅ Full demo seed hoàn tất!")
    print(f"   Password: {DEMO_PASSWORD}")
    print(f"   Tổng nhân viên mới: {len(EXTRA_USERS)}")
    print(f"   Công trình mới: {len(EXTRA_PROJECTS)}")
    print("=" * 60)


def _create_tasks_for_project(
    session: Session,
    project_map: dict[str, Project],
    users: dict[str, User],
    worker_role,
    director,
) -> None:
    t0 = now_utc()

    all_workers = [u for email, u in users.items() if email != "gd@saree.demo"]

    def pick(*emails) -> User | None:
        for e in emails:
            if e in users:
                return users[e]
        return director

    TASK_SPECS: dict[str, list[dict]] = {
        "SAR-002": [
            {
                "name": "Lắp dàn bay hơi kho lạnh",
                "status": "in_progress", "priority": "critical",
                "days": (-15, 10), "headcount": 3, "hours": 40,
                "assignee": "binh@saree.demo",
                "extra": ["khoa@saree.demo", "duc@saree.demo"],
            },
            {
                "name": "Lắp hệ thống điện kho lạnh",
                "status": "todo", "priority": "high",
                "days": (5, 25), "headcount": 2, "hours": 20,
                "assignee": "khoa@saree.demo",
                "extra": [],
            },
            {
                "name": "Bọc cách nhiệt đường ống",
                "status": "in_progress", "priority": "high",
                "days": (-10, 5), "headcount": 2, "hours": 16,
                "assignee": "lan@saree.demo",
                "extra": ["hoa@saree.demo"],
            },
        ],
        "SAR-003": [
            {
                "name": "Lắp đặt đường hầm đông IQF",
                "status": "in_progress", "priority": "critical",
                "days": (-3, 30), "headcount": 4, "hours": 60,
                "assignee": "lan@saree.demo",
                "extra": ["hoa@saree.demo"],  # thiếu 2 người
            },
            {
                "name": "Đấu nối điện tủ điều khiển",
                "status": "todo", "priority": "high",
                "days": (10, 20), "headcount": 2, "hours": 24,
                "assignee": "khoa@saree.demo",
                "extra": ["cuong@saree.demo"],
            },
            {
                "name": "Test chạy thử IQF",
                "status": "todo", "priority": "medium",
                "days": (25, 35), "headcount": 2, "hours": 16,
                "assignee": "nhung@saree.demo",
                "extra": [],
            },
        ],
        "SAR-004": [
            {
                "name": "Tháo máy nén cũ",
                "status": "done", "priority": "high",
                "days": (-2, 0), "headcount": 2, "hours": 8,
                "assignee": "tuan@saree.demo",
                "extra": ["son@saree.demo"],
            },
            {
                "name": "Lắp máy nén mới",
                "status": "in_progress", "priority": "critical",
                "days": (0, 5), "headcount": 3, "hours": 20,
                "assignee": "binh@saree.demo",
                "extra": ["tuan@saree.demo"],  # thiếu 1 người
            },
            {
                "name": "Nạp gas & kiểm tra vận hành",
                "status": "todo", "priority": "high",
                "days": (5, 10), "headcount": 2, "hours": 8,
                "assignee": "nhung@saree.demo",
                "extra": [],
            },
        ],
        "SAR-005": [
            {
                "name": "Lắp tủ điện PLC",
                "status": "done", "priority": "high",
                "days": (-30, -15), "headcount": 2, "hours": 24,
                "assignee": "thang@saree.demo",
                "extra": ["cuong@saree.demo"],
            },
            {
                "name": "Đi dây điện động lực",
                "status": "done", "priority": "high",
                "days": (-20, -8), "headcount": 3, "hours": 32,
                "assignee": "khoa@saree.demo",
                "extra": ["cuong@saree.demo", "duc@saree.demo"],
            },
            {
                "name": "Nghiệm thu & bàn giao",
                "status": "in_progress", "priority": "medium",
                "days": (-8, -3), "headcount": 2, "hours": 8,
                "assignee": "thang@saree.demo",
                "extra": [],
            },
        ],
        "SAR-006": [
            {
                "name": "Khảo sát & lập dự toán",
                "status": "todo", "priority": "medium",
                "days": (7, 12), "headcount": 1, "hours": 8,
                "assignee": "nhung@saree.demo",
                "extra": [],
            },
            {
                "name": "Lắp panel kho lạnh",
                "status": "todo", "priority": "high",
                "days": (14, 45), "headcount": 4, "hours": 80,
                "assignee": "binh@saree.demo",
                "extra": [],  # thiếu 3 người
            },
        ],
    }

    for code, task_list in TASK_SPECS.items():
        proj = project_map.get(code)
        if not proj:
            continue

        # Skip nếu đã có task
        existing = session.exec(
            select(Task).where(Task.project_id == proj.id)
        ).first()
        if existing:
            print(f"  — Tasks {code} đã có, bỏ qua")
            continue

        # Root task
        root = Task(
            project_id=proj.id,
            parent_id=None,
            level=0,
            name=proj.name,
            priority="high",
            status="in_progress" if proj.status == "active" else "todo",
            assignor_id=director.id if director else None,
            assignee_id=pick("totruong@saree.demo", "nhung@saree.demo", "thang@saree.demo").id,
            start_time=t0 + timedelta(days=task_list[0]["days"][0]),
            end_time=t0 + timedelta(days=task_list[-1]["days"][1]),
        )
        session.add(root)
        session.flush()

        for spec in task_list:
            assignee_user = pick(spec["assignee"])
            task = Task(
                project_id=proj.id,
                parent_id=root.id,
                level=1,
                name=spec["name"],
                priority=spec["priority"],
                status=spec["status"],
                required_headcount=spec["headcount"],
                estimated_hours=float(spec["hours"]),
                assignor_id=director.id if director else None,
                assignee_id=assignee_user.id if assignee_user else None,
                start_time=t0 + timedelta(days=spec["days"][0]),
                end_time=t0 + timedelta(days=spec["days"][1]),
            )
            session.add(task)
            session.flush()

            assignor_id = director.id if director else (assignee_user.id if assignee_user else None)

            # Thêm TaskAssignee cho assignee chính
            if assignee_user and assignor_id:
                session.add(TaskAssignee(task_id=task.id, user_id=assignee_user.id, assigned_by=assignor_id))

            # Thêm TaskAssignee cho extra assignees
            for email in spec.get("extra", []):
                extra_user = users.get(email)
                if extra_user and assignor_id:
                    session.add(TaskAssignee(task_id=task.id, user_id=extra_user.id, assigned_by=assignor_id))

        session.flush()
        print(f"  ✓ {code}: {len(task_list)} tasks")


def main() -> None:
    print("🚀 Saree Full Demo Seed")
    with Session(engine) as session:
        try:
            seed(session)
        except Exception as exc:
            print(f"\n❌ Lỗi: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
