"""
Seed dữ liệu thực tế cho company "Công Ty TNHH Điện Lạnh SaiGon" (slug: saree).

- Gán kỹ năng cho từng nhân viên theo tổ
- Thêm tọa độ + tasks + phân công vào các project hiện có
- Tạo 10 khách hàng với tọa độ thực
- Tạo 6 công trình mới gắn với khách hàng

Usage:
    uv run python -m app.scripts.seed_saree_main
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.customer_company import CustomerCompany
from app.models.org import Company, Role, UserCompanyRole
from app.models.project import Project, TaskLevelConfig
from app.models.skill import Skill, UserSkill
from app.models.task import Task, TaskAssignee
from app.models.user import User

COMPANY_SLUG = "saree"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Skill groups per role
# ---------------------------------------------------------------------------
SKILL_MAP: dict[str, list[str]] = {
    "director":       ["Giám sát thi công", "Đọc bản vẽ kỹ thuật", "An toàn lao động"],
    "engineer":       ["Đọc bản vẽ kỹ thuật", "Điện điều khiển PLC", "Hệ thống điện công nghiệp", "An toàn lao động"],
    "planner":        ["Giám sát thi công", "Đọc bản vẽ kỹ thuật"],
    "sales":          [],
    "materials":      [],
    "workshop_lead":  [],  # sẽ gán theo tổ bên dưới
    "worker":         [],
}

# Gán theo email prefix / tổ
USER_SKILL_OVERRIDE: dict[str, list[str]] = {
    "san_iqf":        ["Lắp đặt IQF", "Hệ thống lạnh công nghiệp", "Bọc cách nhiệt", "An toàn lao động", "Giám sát thi công"],
    "thanhvu_tolanh": ["Hệ thống lạnh công nghiệp", "Máy nén lạnh trục vít", "Đường ống môi chất lạnh", "Bọc cách nhiệt", "Giám sát thi công"],
    "nhan_totien":    ["Đường ống nước / chiller", "Đường ống môi chất lạnh", "Lắp đặt kết cấu thép", "An toàn lao động"],
    "sen_todien":     ["Hệ thống điện công nghiệp", "Điện điều khiển PLC", "Hệ thống điện nhẹ", "An toàn lao động", "Giám sát thi công"],
    "tri_tomay_2":    ["Hàn MIG/TIG", "Gia công cơ khí", "Lắp đặt kết cấu thép", "Bảo trì định kỳ"],
    "bo_tomay_1":     ["Hàn MIG/TIG", "Máy nén lạnh trục vít", "Gia công cơ khí", "Bảo trì định kỳ", "Giám sát thi công"],
    "thao_kythuat":   ["Điện điều khiển PLC", "Hệ thống điện công nghiệp", "Đọc bản vẽ kỹ thuật", "Vận hành kho lạnh"],
    "thong_kehoach":  ["Giám sát thi công", "Đọc bản vẽ kỹ thuật", "An toàn lao động"],
    "tuananh":        ["Giám sát thi công", "Đọc bản vẽ kỹ thuật", "An toàn lao động"],
    "vuhuynh":        ["Giám sát thi công", "Đọc bản vẽ kỹ thuật", "Hệ thống lạnh công nghiệp"],
}

# ---------------------------------------------------------------------------
# Khách hàng
# ---------------------------------------------------------------------------
CUSTOMERS = [
    {"name": "Công ty CP Thủy Sản Minh Phú",       "contact_name": "Nguyễn Văn Nam",   "contact_phone": "0909 123 456", "address": "KCN Sông Hậu, Hậu Giang",           "site_lat": 9.7500,  "site_lng": 105.6700},
    {"name": "Công ty TNHH Thực Phẩm Masan Consumer","contact_name": "Trần Thị Hương",  "contact_phone": "0912 456 789", "address": "18 Tân Thới Hiệp 2, Q.12, HCM",     "site_lat": 10.8773, "site_lng": 106.6455},
    {"name": "Công ty CP CJ Vina Agri",             "contact_name": "Phạm Thị Lan",     "contact_phone": "0976 345 678", "address": "KCN Mỹ Phước 3, Bến Cát, Bình Dương","site_lat": 11.0167, "site_lng": 106.6667},
    {"name": "Công ty TNHH Heineken Việt Nam",      "contact_name": "Vũ Đình Long",     "contact_phone": "0908 678 901", "address": "KCN Amata, Biên Hòa, Đồng Nai",     "site_lat": 10.9458, "site_lng": 106.8243},
    {"name": "Công ty TNHH Daiwa Logistics VN",     "contact_name": "Takeshi Mori",     "contact_phone": "028 3636 1234","address": "KCN Tân Tạo, Bình Tân, HCM",         "site_lat": 10.7350, "site_lng": 106.5810},
    {"name": "Công ty TNHH CB Thủy Sản Long An (LAFICO)","contact_name": "Phan Văn Tiến","contact_phone": "0723 456 789","address": "KCN Xuyên Á, Đức Hòa, Long An",    "site_lat": 10.5354, "site_lng": 106.4100},
    {"name": "Công ty CP Đường Biên Hòa",           "contact_name": "Nguyễn Thanh Hải","contact_phone": "0253 382 4567","address": "KCN Biên Hòa 2, Đồng Nai",           "site_lat": 10.9500, "site_lng": 106.8600},
    {"name": "Siêu Thị Lotte Mart (Chuỗi kho lạnh)","contact_name": "Kim Min Joon",    "contact_phone": "028 3988 9898","address": "469 Nguyễn Hữu Thọ, Q.7, HCM",      "site_lat": 10.7297, "site_lng": 106.7005},
    {"name": "Công ty CP Thực Phẩm Hùng Vương",    "contact_name": "Đặng Thị Tuyết",   "contact_phone": "0767 789 012", "address": "KCN Sông Hậu, Hậu Giang",            "site_lat": 9.7600,  "site_lng": 105.6800},
    {"name": "Công ty CP Vinafood 2 (Lương Thực MN)","contact_name": "Vũ Đình Khoa",   "contact_phone": "028 3821 4567","address": "47 Nguyễn Thị Minh Khai, Q.1, HCM", "site_lat": 10.7835, "site_lng": 106.6980},
]

# ---------------------------------------------------------------------------
# Tọa độ + tasks cho projects hiện có
# ---------------------------------------------------------------------------
EXISTING_PROJECT_PATCHES: dict[str, dict] = {
    "TLD-001": {
        "site_lat": 10.9458, "site_lng": 106.8243, "status": "active",
        "tasks": [
            {"name": "Lắp panel kho lạnh -25°C",        "status": "done",        "days": (-40, -15), "headcount": 4, "assignees": ["thanhvu_tolanh", "nhan_totien", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Lắp hệ thống máy nén NH3",        "status": "in_progress", "days": (-15, 10),  "headcount": 3, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Hệ thống điện & PLC",              "status": "in_progress", "days": (-10, 15),  "headcount": 3, "assignees": ["sen_todien", "thao_kythuat", "nhan_totien"]},
            {"name": "Vận hành thử & nghiệm thu",        "status": "todo",        "days": (15, 25),   "headcount": 3, "assignees": ["san_iqf", "thanhvu_tolanh", "thao_kythuat"]},
        ],
    },
    "TLD-002": {
        "site_lat": 10.2143, "site_lng": 105.5982, "status": "active",
        "tasks": [
            {"name": "Kiểm tra & tháo băng tải cũ",     "status": "done",        "days": (-10, -5),  "headcount": 3, "assignees": ["san_iqf", "nhan_totien", "tri_tomay_2"]},
            {"name": "Lắp băng tải IQF mới",            "status": "in_progress", "days": (-5, 10),   "headcount": 4, "assignees": ["san_iqf", "bo_tomay_1", "tri_tomay_2", "nhan_totien"]},
            {"name": "Đấu nối điện & test",              "status": "todo",        "days": (10, 15),   "headcount": 2, "assignees": ["sen_todien", "thao_kythuat"]},
        ],
    },
    "TLD-004": {
        "site_lat": 10.5354, "site_lng": 106.4100, "status": "active",
        "tasks": [
            {"name": "Khảo sát & thiết kế kỹ thuật",    "status": "done",        "days": (-60, -30), "headcount": 2, "assignees": ["tuananh", "thao_kythuat"]},
            {"name": "Lắp kết cấu thép nhà xưởng",      "status": "done",        "days": (-30, -10), "headcount": 5, "assignees": ["bo_tomay_1", "tri_tomay_2", "nhan_totien", "san_iqf", "thanhvu_tolanh"]},
            {"name": "Lắp hệ thống kho lạnh IQF",       "status": "in_progress", "days": (-10, 20),  "headcount": 5, "assignees": ["san_iqf", "thanhvu_tolanh", "nhan_totien", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Lắp hệ thống điện toàn nhà máy",  "status": "in_progress", "days": (-5, 25),   "headcount": 4, "assignees": ["sen_todien", "thao_kythuat", "nhan_totien", "thong_kehoach"]},
            {"name": "Hệ thống nước & PCCC",             "status": "todo",        "days": (20, 40),   "headcount": 3, "assignees": ["nhan_totien", "tri_tomay_2", "bo_tomay_1"]},
            {"name": "Nghiệm thu toàn bộ & bàn giao",   "status": "todo",        "days": (40, 55),   "headcount": 4, "assignees": ["tuananh", "thao_kythuat", "san_iqf", "thong_kehoach"]},
        ],
    },
    "TLD-007": {
        "site_lat": 10.7350, "site_lng": 106.5810, "status": "active",
        "tasks": [
            {"name": "Cải tạo phòng máy lạnh trung tâm","status": "done",        "days": (-20, -8),  "headcount": 3, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Lắp chiller mới 800kW",           "status": "in_progress", "days": (-8, 12),   "headcount": 4, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "nhan_totien", "tri_tomay_2"]},
            {"name": "Hệ thống điện & BMS",             "status": "in_progress", "days": (-5, 15),   "headcount": 3, "assignees": ["sen_todien", "thao_kythuat", "thong_kehoach"]},
            {"name": "Nghiệm thu & bàn giao",           "status": "todo",        "days": (15, 22),   "headcount": 2, "assignees": ["tuananh", "thao_kythuat"]},
        ],
    },
    "TLD-008": {
        "site_lat": 10.8773, "site_lng": 106.6455, "status": "active",
        "tasks": [
            {"name": "Tháo vỏ cách nhiệt cũ",           "status": "in_progress", "days": (-3, 2),    "headcount": 3, "assignees": ["san_iqf", "nhan_totien", "tri_tomay_2"]},
            {"name": "Lắp vỏ panel mới & bịt kín",      "status": "todo",        "days": (2, 8),     "headcount": 3, "assignees": ["san_iqf", "thanhvu_tolanh", "nhan_totien"]},
        ],
    },
    "DEMO-001": {
        "site_lat": 10.7399, "site_lng": 106.5858, "status": "in_progress",
        "tasks": [
            {"name": "Khảo sát hiện trạng",             "status": "done",        "days": (-5, -3),   "headcount": 2, "assignees": ["thao_kythuat", "thong_kehoach"]},
            {"name": "Lắp thử hệ thống lạnh demo",     "status": "in_progress", "days": (-3, 3),    "headcount": 3, "assignees": ["san_iqf", "thanhvu_tolanh", "bo_tomay_1"]},
        ],
    },
}

# ---------------------------------------------------------------------------
# Công trình mới gắn với khách hàng
# ---------------------------------------------------------------------------
NEW_PROJECTS = [
    {
        "code": "TLD-011",
        "name": "Kho lạnh logistics Daiwa – Bình Tân",
        "description": "Xây dựng kho lạnh -25°C 1.500 tấn cho Daiwa VN tại KCN Tân Tạo, Bình Tân.",
        "status": "active", "priority": "high",
        "site_lat": 10.7355, "site_lng": 106.5810,
        "days_start": -45, "days_end": 30, "customer_idx": 4,
        "tasks": [
            {"name": "Lắp panel kho lạnh -25°C",        "status": "done",        "days": (-45, -15), "headcount": 5, "assignees": ["san_iqf", "thanhvu_tolanh", "nhan_totien", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Lắp máy nén & dàn ngưng",         "status": "in_progress", "days": (-15, 10),  "headcount": 4, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "nhan_totien", "tri_tomay_2"]},
            {"name": "Hệ thống điện & monitoring",       "status": "in_progress", "days": (-10, 20),  "headcount": 3, "assignees": ["sen_todien", "thao_kythuat", "nhan_totien"]},
            {"name": "Vận hành thử 72h & bàn giao",     "status": "todo",        "days": (20, 30),   "headcount": 3, "assignees": ["tuananh", "san_iqf", "thao_kythuat"]},
        ],
    },
    {
        "code": "TLD-012",
        "name": "Sửa chữa hệ thống lạnh CJ Vina Agri",
        "description": "Bảo trì + thay thế máy nén và nạp lại NH3 cho 3 kho đông tại KCN Mỹ Phước, Bình Dương.",
        "status": "active", "priority": "critical",
        "site_lat": 11.0200, "site_lng": 106.6700,
        "days_start": -2, "days_end": 8, "customer_idx": 2,
        "tasks": [
            {"name": "Xả môi chất & kiểm tra",          "status": "done",        "days": (-2, -1),   "headcount": 2, "assignees": ["thanhvu_tolanh", "bo_tomay_1"]},
            {"name": "Thay máy nén & seal",              "status": "in_progress", "days": (-1, 4),    "headcount": 3, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "tri_tomay_2"]},
            {"name": "Nạp NH3 & test vận hành",         "status": "todo",        "days": (4, 8),     "headcount": 2, "assignees": ["thanhvu_tolanh", "san_iqf"]},
        ],
    },
    {
        "code": "TLD-013",
        "name": "Hệ thống lạnh nhà máy Heineken Biên Hòa",
        "description": "Lắp mới hệ thống làm lạnh bia (chiller 500kW) + đường ống nước lạnh cho Heineken Biên Hòa.",
        "status": "active", "priority": "high",
        "site_lat": 10.9460, "site_lng": 106.8250,
        "days_start": -25, "days_end": 20, "customer_idx": 3,
        "tasks": [
            {"name": "Lắp chiller nước 500kW",          "status": "done",        "days": (-25, -8),  "headcount": 4, "assignees": ["thanhvu_tolanh", "bo_tomay_1", "nhan_totien", "tri_tomay_2"]},
            {"name": "Hệ thống đường ống nước lạnh",    "status": "done",        "days": (-15, -3),  "headcount": 3, "assignees": ["nhan_totien", "tri_tomay_2", "san_iqf"]},
            {"name": "Đấu nối điện & PLC",              "status": "in_progress", "days": (-3, 10),   "headcount": 3, "assignees": ["sen_todien", "thao_kythuat", "thong_kehoach"]},
            {"name": "Test vận hành & nghiệm thu",      "status": "todo",        "days": (10, 20),   "headcount": 3, "assignees": ["tuananh", "san_iqf", "thao_kythuat"]},
        ],
    },
    {
        "code": "TLD-014",
        "name": "Bảo trì kho lạnh Lotte Mart Q.7",
        "description": "Bảo trì sửa chữa tủ lạnh trưng bày + kho thịt -2°C + kho đông -18°C tại Lotte Mart Q.7.",
        "status": "active", "priority": "normal",
        "site_lat": 10.7300, "site_lng": 106.7010,
        "days_start": 0, "days_end": 5, "customer_idx": 7,
        "tasks": [
            {"name": "Kiểm tra tủ lạnh trưng bày",      "status": "in_progress", "days": (0, 2),     "headcount": 2, "assignees": ["san_iqf", "nhan_totien"]},
            {"name": "Sửa kho đông & nạp gas R404A",    "status": "todo",        "days": (2, 5),     "headcount": 2, "assignees": ["thanhvu_tolanh", "bo_tomay_1"]},
        ],
    },
    {
        "code": "TLD-015",
        "name": "Bảo trì hệ thống lạnh LAFICO Long An",
        "description": "Bảo trì định kỳ Q2/2026: kiểm tra toàn bộ kho đông, hầm đông, IQF tại nhà máy LAFICO Long An.",
        "status": "active", "priority": "normal",
        "site_lat": 10.5360, "site_lng": 106.4110,
        "days_start": -1, "days_end": 7, "customer_idx": 5,
        "tasks": [
            {"name": "Kiểm tra & vệ sinh dàn lạnh",     "status": "in_progress", "days": (-1, 2),    "headcount": 3, "assignees": ["san_iqf", "nhan_totien", "tri_tomay_2"]},
            {"name": "Kiểm tra máy nén & thay dầu",     "status": "todo",        "days": (2, 5),     "headcount": 2, "assignees": ["thanhvu_tolanh", "bo_tomay_1"]},
            {"name": "Lập biên bản bảo trì",            "status": "todo",        "days": (5, 7),     "headcount": 1, "assignees": ["thong_kehoach"]},
        ],
    },
]


def upsert_assignee(session: Session, task_id, user_id, by_id) -> None:
    if not session.exec(select(TaskAssignee).where(TaskAssignee.task_id == task_id, TaskAssignee.user_id == user_id)).first():
        session.add(TaskAssignee(task_id=task_id, user_id=user_id, assigned_by=by_id))


def make_task_levels(session: Session, project_id) -> None:
    for lvl, label, proof, children in [(0, "Đầu việc chính", False, True), (1, "Hạng mục", False, True), (2, "Công việc", True, False)]:
        if not session.exec(select(TaskLevelConfig).where(TaskLevelConfig.project_id == project_id, TaskLevelConfig.level == lvl)).first():
            session.add(TaskLevelConfig(project_id=project_id, level=lvl, label=label, requires_proof=proof, can_have_children=children))


def seed(session: Session) -> None:
    company = session.exec(select(Company).where(Company.slug == COMPANY_SLUG)).first()
    if not company:
        print("❌ Không tìm thấy company.", file=sys.stderr); sys.exit(1)

    users_by_prefix: dict[str, User] = {}
    users_by_email: dict[str, User] = {}
    all_users = session.exec(select(User).where(User.company_id == company.id)).all()
    for u in all_users:
        users_by_email[u.email] = u
        prefix = u.email.split("@")[0]
        users_by_prefix[prefix] = u

    director = users_by_email.get("tuananh@saree.com") or users_by_email.get("vuhuynh@saree.com")
    if not director:
        print("❌ Không tìm thấy director.", file=sys.stderr); sys.exit(1)

    skill_by_name: dict[str, Skill] = {s.name: s for s in session.exec(select(Skill).where(Skill.company_id == company.id)).all()}

    def resolve(email_prefix: str) -> User | None:
        return users_by_prefix.get(email_prefix) or users_by_email.get(email_prefix)

    # 1. Gán kỹ năng
    print("▶ Gán kỹ năng cho nhân viên...")
    for prefix, skill_names in USER_SKILL_OVERRIDE.items():
        u = resolve(prefix)
        if not u: continue
        for sname in skill_names:
            skill = skill_by_name.get(sname)
            if not skill: continue
            if not session.exec(select(UserSkill).where(UserSkill.user_id == u.id, UserSkill.skill_id == skill.id, UserSkill.company_id == company.id)).first():
                session.add(UserSkill(user_id=u.id, skill_id=skill.id, company_id=company.id, level=3))
    # Gán theo role cho còn lại
    ucrs = session.exec(select(UserCompanyRole).where(UserCompanyRole.company_id == company.id)).all()
    for ucr in ucrs:
        u = session.get(User, ucr.user_id)
        if not u: continue
        prefix = u.email.split("@")[0]
        if prefix in USER_SKILL_OVERRIDE: continue
        role = session.get(Role, ucr.role_id)
        if not role: continue
        for sname in SKILL_MAP.get(role.name, []):
            skill = skill_by_name.get(sname)
            if not skill: continue
            if not session.exec(select(UserSkill).where(UserSkill.user_id == u.id, UserSkill.skill_id == skill.id, UserSkill.company_id == company.id)).first():
                session.add(UserSkill(user_id=u.id, skill_id=skill.id, company_id=company.id, level=3))
    session.flush()
    print("  ✓ Xong")

    # 2. Tạo khách hàng
    print("▶ Tạo khách hàng...")
    customers: list[CustomerCompany] = []
    for c_data in CUSTOMERS:
        cc = session.exec(select(CustomerCompany).where(CustomerCompany.company_id == company.id, CustomerCompany.name == c_data["name"])).first()
        if not cc:
            cc = CustomerCompany(company_id=company.id, created_by=director.id, is_active=True, is_deleted=False, **c_data)
            session.add(cc)
            session.flush()
            print(f"  ✓ {cc.name[:55]}")
        else:
            print(f"  — {cc.name[:55]} (đã có)")
        customers.append(cc)
    session.flush()

    # 3. Patch projects hiện có: thêm tọa độ + tasks
    t0 = now_utc()
    today = date.today()
    print("▶ Patch projects hiện có...")
    existing_projects: dict[str, Project] = {p.code: p for p in session.exec(select(Project).where(Project.company_id == company.id, Project.is_deleted == False)).all()}

    for code, patch in EXISTING_PROJECT_PATCHES.items():
        proj = existing_projects.get(code)
        if not proj: continue
        proj.site_lat = patch["site_lat"]
        proj.site_lng = patch["site_lng"]
        if proj.status in ("planning", "on_hold"):
            proj.status = patch.get("status", proj.status)
        session.add(proj)
        make_task_levels(session, proj.id)
        session.flush()

        existing_task_check = session.exec(select(Task).where(Task.project_id == proj.id, Task.level == 1)).first()
        if existing_task_check:
            # Chỉ update assignees nếu task đã có nhưng thiếu assignees
            for t in session.exec(select(Task).where(Task.project_id == proj.id, Task.level == 1, Task.status == "in_progress")).all():
                for spec in patch["tasks"]:
                    if spec["name"] == t.name:
                        for prefix in spec["assignees"]:
                            u = resolve(prefix)
                            if u: upsert_assignee(session, t.id, u.id, director.id)
            print(f"  — {code}: tasks đã có, chỉ gán assignees")
            continue

        # Root task
        root = Task(project_id=proj.id, level=0, name=proj.name, priority="high",
                    status="in_progress", assignor_id=director.id, assignee_id=director.id,
                    start_time=t0 - timedelta(days=60), end_time=t0 + timedelta(days=60))
        session.add(root)
        session.flush()

        for spec in patch["tasks"]:
            primary = resolve(spec["assignees"][0]) if spec["assignees"] else director
            task = Task(project_id=proj.id, parent_id=root.id, level=1,
                        name=spec["name"], priority="high", status=spec["status"],
                        required_headcount=spec["headcount"], estimated_hours=float(spec["headcount"] * 8),
                        assignor_id=director.id, assignee_id=primary.id if primary else director.id,
                        start_time=t0 + timedelta(days=spec["days"][0]),
                        end_time=t0 + timedelta(days=spec["days"][1]))
            session.add(task)
            session.flush()
            for prefix in spec["assignees"]:
                u = resolve(prefix)
                if u: upsert_assignee(session, task.id, u.id, director.id)
        session.flush()
        n_in_prog = len([s for s in patch["tasks"] if s["status"] == "in_progress"])
        print(f"  ✓ {code}: {len(patch['tasks'])} tasks ({n_in_prog} in_progress)")

    # 4. Tạo projects mới
    print("▶ Tạo công trình mới...")
    for p_spec in NEW_PROJECTS:
        if existing_projects.get(p_spec["code"]):
            print(f"  — {p_spec['code']} đã có"); continue
        proj = Project(company_id=company.id, name=p_spec["name"], code=p_spec["code"],
                       description=p_spec["description"], status=p_spec["status"], priority=p_spec["priority"],
                       site_lat=p_spec["site_lat"], site_lng=p_spec["site_lng"],
                       start_date=today + timedelta(days=p_spec["days_start"]),
                       end_date=today + timedelta(days=p_spec["days_end"]),
                       pm_id=director.id, created_by=director.id)
        session.add(proj)
        session.flush()
        make_task_levels(session, proj.id)
        root = Task(project_id=proj.id, level=0, name=proj.name, priority="high",
                    status="in_progress", assignor_id=director.id, assignee_id=director.id,
                    start_time=t0 + timedelta(days=p_spec["days_start"]),
                    end_time=t0 + timedelta(days=p_spec["days_end"]))
        session.add(root)
        session.flush()
        for spec in p_spec["tasks"]:
            primary = resolve(spec["assignees"][0]) if spec["assignees"] else director
            task = Task(project_id=proj.id, parent_id=root.id, level=1,
                        name=spec["name"], priority=p_spec["priority"], status=spec["status"],
                        required_headcount=spec["headcount"], estimated_hours=float(spec["headcount"] * 8),
                        assignor_id=director.id, assignee_id=primary.id if primary else director.id,
                        start_time=t0 + timedelta(days=spec["days"][0]),
                        end_time=t0 + timedelta(days=spec["days"][1]))
            session.add(task)
            session.flush()
            for prefix in spec["assignees"]:
                u = resolve(prefix)
                if u: upsert_assignee(session, task.id, u.id, director.id)
        session.flush()
        cust = customers[p_spec["customer_idx"]]
        n_staff = len({e for t in p_spec["tasks"] for e in t["assignees"]})
        print(f"  ✓ {p_spec['code']}: {proj.name[:42]} | {len(p_spec['tasks'])} tasks | {n_staff} người | KH: {cust.name[:28]}")

    session.commit()

    # Summary
    total_proj = session.exec(select(Project).where(Project.company_id == company.id, Project.is_deleted == False)).all()
    active = [p for p in total_proj if p.status == "active"]
    total_ta = session.exec(select(TaskAssignee)).all()
    in_prog_tasks = session.exec(select(Task).where(Task.project_id.in_([p.id for p in total_proj]), Task.status == "in_progress", Task.level == 1)).all()
    print("\n" + "=" * 65)
    print(f"✅ Seed '{company.name}' hoàn tất!")
    print(f"   Khách hàng    : {len(CUSTOMERS)}")
    print(f"   Tổng CT       : {len(total_proj)} ({len(active)} active)")
    print(f"   Task in_prog  : {len(in_prog_tasks)}")
    print(f"   TaskAssignee  : {len(total_ta)} rows")
    print("=" * 65)


def main() -> None:
    print("🚀 Seed Saree Main Company")
    with Session(engine) as session:
        try:
            seed(session)
        except Exception as e:
            print(f"❌ {e}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
