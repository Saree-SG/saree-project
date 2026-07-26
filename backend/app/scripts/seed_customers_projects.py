"""
Seed khách hàng + công trình đa dạng + nhân sự làm việc thực tế.

Usage:
    uv run python -m app.scripts.seed_customers_projects
"""
from __future__ import annotations

import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.customer_company import CustomerCompany
from app.models.org import Company, Role, UserCompanyRole
from app.models.project import Project, TaskLevelConfig
from app.models.task import Task, TaskAssignee
from app.models.user import User

POC_COMPANY_SLUG = "saree-poc"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 12 Khách hàng thực tế ngành thực phẩm / kho lạnh / công nghiệp VN
# ---------------------------------------------------------------------------
CUSTOMERS = [
    {
        "name": "Công ty CP Thủy Sản Minh Phú",
        "type": "customer",
        "tax_code": "2100412345",
        "contact_name": "Nguyễn Văn Nam",
        "contact_title": "Giám đốc kỹ thuật",
        "contact_phone": "0909 123 456",
        "address": "KCN Hòa Khánh, Q. Liên Chiểu, TP. Đà Nẵng",
        "site_lat": 10.4114, "site_lng": 106.9574,   # Cần Giờ
    },
    {
        "name": "Công ty TNHH Thực Phẩm Masan Consumer",
        "type": "customer",
        "tax_code": "0312345678",
        "contact_name": "Trần Thị Hương",
        "contact_title": "Trưởng phòng dự án",
        "contact_phone": "0912 456 789",
        "address": "18 Tân Thới Hiệp 2, Q. 12, TP. HCM",
        "site_lat": 10.8773, "site_lng": 106.6455,   # Quận 12 HCM
    },
    {
        "name": "Công ty CP Chế Biến Thực Phẩm Kinh Đô",
        "type": "customer",
        "tax_code": "0301234567",
        "contact_name": "Lê Minh Đức",
        "contact_title": "Quản lý bảo trì",
        "contact_phone": "0901 234 567",
        "address": "391 Hùng Vương, P. 12, Q. 6, TP. HCM",
        "site_lat": 10.7480, "site_lng": 106.6222,
    },
    {
        "name": "Công ty TNHH Poultry CP Việt Nam",
        "type": "customer",
        "tax_code": "3702345678",
        "contact_name": "Phạm Thị Lan",
        "contact_title": "Trưởng nhóm kỹ thuật",
        "contact_phone": "0976 345 678",
        "address": "KCN Bàu Bàng, Bình Dương",
        "site_lat": 11.1736, "site_lng": 106.6120,   # Bình Dương KCN
    },
    {
        "name": "Công ty CP Thực Phẩm CJ Vina Agri",
        "type": "customer",
        "tax_code": "3700456789",
        "contact_name": "Hoàng Văn Tuấn",
        "contact_title": "Phó GĐ sản xuất",
        "contact_phone": "0933 567 890",
        "address": "KCN Mỹ Phước 3, Bến Cát, Bình Dương",
        "site_lat": 11.0167, "site_lng": 106.6667,   # Bình Dương
    },
    {
        "name": "Tổng Công ty Lương Thực Miền Nam (Vinafood 2)",
        "type": "customer",
        "tax_code": "0300234567",
        "contact_name": "Vũ Đình Khoa",
        "contact_title": "Giám đốc kỹ thuật",
        "contact_phone": "028 3821 4567",
        "address": "47 Nguyễn Thị Minh Khai, Q.1, TP. HCM",
        "site_lat": 10.7835, "site_lng": 106.6980,
    },
    {
        "name": "Công ty TNHH Sản Xuất Bia Heineken VN",
        "type": "customer",
        "tax_code": "0315678901",
        "contact_name": "Bùi Văn Long",
        "contact_title": "Kỹ sư trưởng hệ thống lạnh",
        "contact_phone": "0908 678 901",
        "address": "KCN Amata, Biên Hòa, Đồng Nai",
        "site_lat": 10.9458, "site_lng": 106.8243,   # Đồng Nai
    },
    {
        "name": "Công ty CP Thủy Sản Hùng Vương",
        "type": "customer",
        "tax_code": "1800123456",
        "contact_name": "Đặng Thị Tuyết",
        "contact_title": "Trưởng phòng kỹ thuật",
        "contact_phone": "0767 789 012",
        "address": "KCN Sông Hậu, Hậu Giang",
        "site_lat": 10.2143, "site_lng": 105.5982,   # Hậu Giang
    },
    {
        "name": "Công ty TNHH Refrigerated Logistics Daiwa VN",
        "type": "customer",
        "tax_code": "0316789012",
        "contact_name": "Takeshi Yamamoto",
        "contact_title": "Operations Manager",
        "contact_phone": "028 3636 1234",
        "address": "KCN Tân Tạo, Bình Tân, TP. HCM",
        "site_lat": 10.7350, "site_lng": 106.5800,   # Bình Tân
    },
    {
        "name": "Công ty CP Đường Biên Hòa",
        "type": "customer",
        "tax_code": "3600890123",
        "contact_name": "Nguyễn Thanh Hải",
        "contact_title": "Giám đốc vận hành",
        "contact_phone": "0253 382 4567",
        "address": "KCN Biên Hòa 2, Đồng Nai",
        "site_lat": 10.9500, "site_lng": 106.8600,
    },
    {
        "name": "Siêu Thị Lotte Mart (Chuỗi kho lạnh)",
        "type": "customer",
        "tax_code": "0313456789",
        "contact_name": "Kim Min Joon",
        "contact_title": "Facility Manager VN",
        "contact_phone": "028 3988 9898",
        "address": "469 Nguyễn Hữu Thọ, Q. 7, TP. HCM",
        "site_lat": 10.7297, "site_lng": 106.7005,   # Q7
    },
    {
        "name": "Công ty TNHH CB Thủy Sản Long An (LAFICO)",
        "type": "customer",
        "tax_code": "1100456789",
        "contact_name": "Phan Văn Tiến",
        "contact_title": "Phó GĐ kỹ thuật",
        "contact_phone": "0723 456 789",
        "address": "KCN Xuyên Á, Đức Hòa, Long An",
        "site_lat": 10.5354, "site_lng": 106.4100,   # Long An
    },
]

# ---------------------------------------------------------------------------
# Công trình gắn với từng khách hàng
# ---------------------------------------------------------------------------
CUSTOMER_PROJECTS = [
    # Minh Phú — Cần Giờ  (đã có SAR-002, đây là thêm)
    {
        "code": "SAR-101",
        "customer_idx": 0,  # Minh Phú
        "name": "Nâng cấp kho đông lạnh Minh Phú – Line 2",
        "description": "Mở rộng dây chuyền đông lạnh IQF line 2 cho Công ty CP Thủy Sản Minh Phú, công suất 15 tấn/giờ.",
        "status": "active", "priority": "high",
        "site_lat": 10.4110, "site_lng": 106.9580,
        "days_start": -12, "days_end": 45,
        "assignees": ["lan@saree.demo", "hoa@saree.demo", "mai@saree.demo"],
        "tasks": [
            {"name": "Tháo dỡ thiết bị cũ", "status": "done", "days": (-12, -5), "headcount": 3, "assignees": ["binh@saree.demo", "duc@saree.demo", "son@saree.demo"]},
            {"name": "Lắp đặt đường hầm IQF line 2", "status": "in_progress", "days": (-5, 25), "headcount": 5, "assignees": ["lan@saree.demo", "hoa@saree.demo", "mai@saree.demo", "nhung@saree.demo"]},
            {"name": "Đấu nối hệ thống điện & điều khiển", "status": "in_progress", "days": (10, 30), "headcount": 3, "assignees": ["thang@saree.demo", "khoa@saree.demo"]},
            {"name": "Vận hành thử & bàn giao", "status": "todo", "days": (30, 45), "headcount": 2, "assignees": ["nhung@saree.demo"]},
        ],
    },
    # Masan — Q12 HCM
    {
        "code": "SAR-102",
        "customer_idx": 1,  # Masan
        "name": "Lắp hệ thống lạnh nhà máy Masan Quận 12",
        "description": "Lắp đặt hệ thống làm lạnh nhanh & kho bảo quản sản phẩm thực phẩm cho nhà máy Masan Consumer tại TP. HCM.",
        "status": "active", "priority": "high",
        "site_lat": 10.8780, "site_lng": 106.6460,
        "days_start": -8, "days_end": 50,
        "assignees": ["khoa@saree.demo", "cuong@saree.demo"],
        "tasks": [
            {"name": "Lắp panel kho lạnh nhanh", "status": "in_progress", "days": (-8, 15), "headcount": 4, "assignees": ["binh@saree.demo", "hung@saree.demo", "duc@saree.demo", "son@saree.demo"]},
            {"name": "Hệ thống điện điều khiển", "status": "in_progress", "days": (-3, 20), "headcount": 3, "assignees": ["khoa@saree.demo", "cuong@saree.demo", "thang@saree.demo"]},
            {"name": "Nghiệm thu & huấn luyện vận hành", "status": "todo", "days": (20, 50), "headcount": 2, "assignees": ["nhung@saree.demo"]},
        ],
    },
    # CJ Vina — Bình Dương KCN Mỹ Phước
    {
        "code": "SAR-103",
        "customer_idx": 4,  # CJ Vina
        "name": "Sửa chữa máy lạnh CJ Vina Agri – Bình Dương",
        "description": "Bảo trì, sửa chữa 3 dàn lạnh công nghiệp và nạp lại môi chất NH3 tại nhà máy CJ Vina Agri KCN Mỹ Phước.",
        "status": "active", "priority": "critical",
        "site_lat": 11.0200, "site_lng": 106.6700,
        "days_start": -2, "days_end": 10,
        "assignees": ["tuan@saree.demo", "binh@saree.demo"],
        "tasks": [
            {"name": "Kiểm tra & xả môi chất cũ", "status": "done", "days": (-2, -1), "headcount": 2, "assignees": ["tuan@saree.demo", "binh@saree.demo"]},
            {"name": "Sửa chữa dàn lạnh & thay seal", "status": "in_progress", "days": (-1, 5), "headcount": 3, "assignees": ["tuan@saree.demo", "binh@saree.demo", "hung@saree.demo"]},
            {"name": "Nạp NH3 & test vận hành", "status": "todo", "days": (5, 10), "headcount": 2, "assignees": ["nhung@saree.demo", "tuan@saree.demo"]},
        ],
    },
    # Heineken — Đồng Nai
    {
        "code": "SAR-104",
        "customer_idx": 6,  # Heineken
        "name": "Hệ thống lạnh nhà máy Heineken Biên Hòa",
        "description": "Lắp mới hệ thống làm lạnh bia (chiller nước + dàn lạnh) cho nhà máy Heineken Biên Hòa, công suất 500 kW.",
        "status": "active", "priority": "high",
        "site_lat": 10.9460, "site_lng": 106.8250,
        "days_start": -30, "days_end": 20,
        "assignees": ["thang@saree.demo", "cuong@saree.demo"],
        "tasks": [
            {"name": "Lắp chiller nước 500kW", "status": "done", "days": (-30, -10), "headcount": 4, "assignees": ["binh@saree.demo", "tuan@saree.demo", "duc@saree.demo", "son@saree.demo"]},
            {"name": "Hệ thống đường ống nước lạnh", "status": "done", "days": (-20, -5), "headcount": 3, "assignees": ["thang@saree.demo", "khoa@saree.demo", "hung@saree.demo"]},
            {"name": "Đấu nối điện & PLC", "status": "in_progress", "days": (-5, 10), "headcount": 3, "assignees": ["thang@saree.demo", "cuong@saree.demo", "khoa@saree.demo"]},
            {"name": "Thử nghiệm & bàn giao", "status": "todo", "days": (10, 20), "headcount": 2, "assignees": ["nhung@saree.demo"]},
        ],
    },
    # Refrigerated Logistics Daiwa — Bình Tân HCM
    {
        "code": "SAR-105",
        "customer_idx": 8,  # Daiwa
        "name": "Kho lạnh logistics Daiwa – Bình Tân",
        "description": "Xây dựng kho lạnh logistics -25°C (1.500 tấn) cho Daiwa VN tại KCN Tân Tạo, Bình Tân, TP. HCM.",
        "status": "active", "priority": "high",
        "site_lat": 10.7355, "site_lng": 106.5810,
        "days_start": -45, "days_end": 30,
        "assignees": ["lan@saree.demo", "mai@saree.demo"],
        "tasks": [
            {"name": "Lắp panel kho lạnh -25°C", "status": "done", "days": (-45, -15), "headcount": 5, "assignees": ["binh@saree.demo", "hung@saree.demo", "duc@saree.demo", "son@saree.demo", "tuan@saree.demo"]},
            {"name": "Lắp máy nén & dàn ngưng", "status": "in_progress", "days": (-15, 10), "headcount": 4, "assignees": ["lan@saree.demo", "mai@saree.demo", "hoa@saree.demo", "nhung@saree.demo"]},
            {"name": "Hệ thống điện & monitoring", "status": "in_progress", "days": (-10, 20), "headcount": 3, "assignees": ["thang@saree.demo", "khoa@saree.demo", "cuong@saree.demo"]},
            {"name": "Bàn giao & vận hành thử 72h", "status": "todo", "days": (20, 30), "headcount": 3, "assignees": ["nhung@saree.demo"]},
        ],
    },
    # LAFICO — Long An
    {
        "code": "SAR-106",
        "customer_idx": 11,  # LAFICO
        "name": "Bảo trì hệ thống lạnh LAFICO Long An",
        "description": "Bảo trì định kỳ quý 2/2026: kiểm tra toàn bộ hệ thống kho đông, hầm đông, IQF tại nhà máy LAFICO Long An.",
        "status": "active", "priority": "normal",
        "site_lat": 10.5360, "site_lng": 106.4110,
        "days_start": -1, "days_end": 7,
        "assignees": ["tuan@saree.demo"],
        "tasks": [
            {"name": "Kiểm tra & vệ sinh dàn lạnh", "status": "in_progress", "days": (-1, 2), "headcount": 3, "assignees": ["tuan@saree.demo", "son@saree.demo", "duc@saree.demo"]},
            {"name": "Kiểm tra máy nén & thay dầu", "status": "todo", "days": (2, 5), "headcount": 2, "assignees": ["binh@saree.demo", "tuan@saree.demo"]},
            {"name": "Lập biên bản bảo trì", "status": "todo", "days": (5, 7), "headcount": 1, "assignees": ["nhung@saree.demo"]},
        ],
    },
    # Lotte Mart — Q7 HCM
    {
        "code": "SAR-107",
        "customer_idx": 10,  # Lotte
        "name": "Bảo trì kho lạnh Lotte Mart Q.7",
        "description": "Bảo trì sửa chữa hệ thống tủ lạnh trưng bày, kho thịt -2°C và kho đông -18°C tại siêu thị Lotte Mart Quận 7.",
        "status": "active", "priority": "normal",
        "site_lat": 10.7300, "site_lng": 106.7010,
        "days_start": 0, "days_end": 5,
        "assignees": ["khoa@saree.demo"],
        "tasks": [
            {"name": "Kiểm tra tủ lạnh trưng bày", "status": "in_progress", "days": (0, 2), "headcount": 2, "assignees": ["khoa@saree.demo", "cuong@saree.demo"]},
            {"name": "Sửa kho đông & nạp gas", "status": "todo", "days": (2, 5), "headcount": 2, "assignees": ["binh@saree.demo", "khoa@saree.demo"]},
        ],
    },
]


def get_or_create_customer(session: Session, data: dict, company_id: uuid.UUID, created_by: uuid.UUID) -> CustomerCompany:
    cc = session.exec(
        select(CustomerCompany).where(
            CustomerCompany.company_id == company_id,
            CustomerCompany.name == data["name"],
        )
    ).first()
    if cc:
        return cc
    cc = CustomerCompany(
        company_id=company_id,
        created_by=created_by,
        name=data["name"],
        type=data.get("type", "customer"),
        tax_code=data.get("tax_code"),
        contact_name=data.get("contact_name"),
        contact_title=data.get("contact_title"),
        contact_phone=data.get("contact_phone"),
        address=data.get("address"),
        site_lat=data.get("site_lat"),
        site_lng=data.get("site_lng"),
        is_active=True,
        is_deleted=False,
    )
    session.add(cc)
    session.flush()
    return cc


def upsert_assignee(session: Session, task_id: uuid.UUID, user_id: uuid.UUID, assigned_by: uuid.UUID) -> None:
    exists = session.exec(
        select(TaskAssignee).where(TaskAssignee.task_id == task_id, TaskAssignee.user_id == user_id)
    ).first()
    if not exists:
        session.add(TaskAssignee(task_id=task_id, user_id=user_id, assigned_by=assigned_by))


def main() -> None:
    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.slug == POC_COMPANY_SLUG)).first()
        if not company:
            print("❌ Không tìm thấy company POC. Chạy seed_poc_demo trước.", file=sys.stderr)
            sys.exit(1)

        users_by_email: dict[str, User] = {
            u.email: u for u in session.exec(select(User).where(User.company_id == company.id)).all()
        }

        director = users_by_email.get("gd@saree.demo")
        if not director:
            print("❌ Không tìm thấy giám đốc.", file=sys.stderr)
            sys.exit(1)

        worker_role = session.exec(
            select(Role).where(Role.company_id == company.id, Role.name == "worker")
        ).first()

        # 1. Tạo khách hàng
        print("▶ Tạo khách hàng...")
        customers: list[CustomerCompany] = []
        for c_data in CUSTOMERS:
            cc = get_or_create_customer(session, c_data, company.id, director.id)
            customers.append(cc)
            print(f"  ✓ {cc.name[:50]}")
        session.flush()

        # 2. Tạo công trình + tasks
        print("▶ Tạo công trình & phân công nhân sự...")
        today = date.today()
        t0 = now_utc()

        for p_spec in CUSTOMER_PROJECTS:
            # Kiểm tra đã tồn tại
            existing = session.exec(
                select(Project).where(Project.company_id == company.id, Project.code == p_spec["code"])
            ).first()
            if existing:
                print(f"  — {p_spec['code']} đã tồn tại, bỏ qua")
                continue

            customer = customers[p_spec["customer_idx"]]

            proj = Project(
                company_id=company.id,
                name=p_spec["name"],
                code=p_spec["code"],
                description=p_spec["description"],
                status=p_spec["status"],
                priority=p_spec.get("priority", "normal"),
                site_lat=p_spec["site_lat"],
                site_lng=p_spec["site_lng"],
                start_date=today + timedelta(days=p_spec["days_start"]),
                end_date=today + timedelta(days=p_spec["days_end"]),
                pm_id=director.id,
                created_by=director.id,
            )
            session.add(proj)
            session.flush()

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
            session.flush()

            # Root task
            root = Task(
                project_id=proj.id,
                level=0,
                name=p_spec["name"],
                priority=p_spec.get("priority", "high"),
                status="in_progress",
                assignor_id=director.id,
                assignee_id=director.id,
                start_time=t0 + timedelta(days=p_spec["days_start"]),
                end_time=t0 + timedelta(days=p_spec["days_end"]),
            )
            session.add(root)
            session.flush()

            for t_spec in p_spec["tasks"]:
                # Assignee chính = người đầu tiên trong list
                primary_email = t_spec["assignees"][0] if t_spec["assignees"] else None
                primary_user = users_by_email.get(primary_email) if primary_email else None

                task = Task(
                    project_id=proj.id,
                    parent_id=root.id,
                    level=1,
                    name=t_spec["name"],
                    priority=p_spec.get("priority", "normal"),
                    status=t_spec["status"],
                    required_headcount=t_spec["headcount"],
                    estimated_hours=float(t_spec["headcount"] * 8),
                    assignor_id=director.id,
                    assignee_id=primary_user.id if primary_user else director.id,
                    start_time=t0 + timedelta(days=t_spec["days"][0]),
                    end_time=t0 + timedelta(days=t_spec["days"][1]),
                )
                session.add(task)
                session.flush()

                for email in t_spec["assignees"]:
                    u = users_by_email.get(email)
                    if u:
                        upsert_assignee(session, task.id, u.id, director.id)

            session.flush()
            n_tasks = len(p_spec["tasks"])
            n_staff = len({e for t in p_spec["tasks"] for e in t["assignees"]})
            print(f"  ✓ {p_spec['code']}: {proj.name[:40]} | {n_tasks} tasks | {n_staff} nhân sự | KH: {customer.name[:30]}")

        session.commit()

        # Summary
        total_cc = session.exec(select(CustomerCompany).where(CustomerCompany.company_id == company.id)).all()
        total_proj = session.exec(select(Project).where(Project.company_id == company.id, Project.is_deleted == False)).all()
        total_ta = session.exec(select(TaskAssignee)).all()

        print("\n" + "=" * 65)
        print("✅ Seed hoàn tất!")
        print(f"   Tổng khách hàng : {len(total_cc)}")
        print(f"   Tổng công trình : {len(total_proj)}")
        print(f"   Tổng phân công  : {len(total_ta)} task-assignee rows")
        print("=" * 65)


if __name__ == "__main__":
    main()
