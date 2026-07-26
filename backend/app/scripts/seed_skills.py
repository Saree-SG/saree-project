"""
Seed kỹ năng mặc định cho tất cả công ty đã có trong DB.
Idempotent: chỉ tạo nếu công ty chưa có skill nào.

Usage:
    uv run python -m app.scripts.seed_skills
  hoặc production:
    docker compose exec backend python -m app.scripts.seed_skills
"""
from __future__ import annotations

from sqlmodel import Session, select

from app.core.db import engine
from app.models.org import Company
from app.models.skill import Skill

# ---------------------------------------------------------------------------
# Danh sách kỹ năng mặc định (phù hợp ngành Cơ Điện Lạnh / xây lắp)
# ---------------------------------------------------------------------------
DEFAULT_SKILLS: list[dict] = [
    # Lạnh
    {"category": "lanh",     "name": "Hệ thống lạnh công nghiệp",       "description": "Lắp đặt, vận hành hệ thống kho lạnh, hầm đông"},
    {"category": "lanh",     "name": "Máy nén lạnh trục vít",           "description": "Bảo trì, sửa chữa máy nén trục vít"},
    {"category": "lanh",     "name": "Lắp đặt IQF",                     "description": "Lắp đặt đường hầm đông IQF"},
    {"category": "lanh",     "name": "Bọc cách nhiệt",                  "description": "Bọc cách nhiệt đường ống, thiết bị lạnh"},
    {"category": "lanh",     "name": "Lắp panel cách nhiệt",            "description": "Lắp panel kho lạnh, phòng đông"},
    # Điện
    {"category": "dien",     "name": "Hệ thống điện công nghiệp",       "description": "Tủ điện, dây dẫn, thiết bị đóng cắt"},
    {"category": "dien",     "name": "Điện điều khiển PLC",             "description": "Lập trình, vận hành PLC, SCADA"},
    {"category": "dien",     "name": "Hệ thống điện nhẹ",               "description": "Camera, cáp mạng, báo cháy"},
    # Cơ khí
    {"category": "co_khi",   "name": "Hàn MIG/TIG",                     "description": "Hàn kết cấu thép, đường ống inox"},
    {"category": "co_khi",   "name": "Gia công cơ khí",                 "description": "Tiện, phay, khoan kết cấu"},
    {"category": "co_khi",   "name": "Lắp đặt kết cấu thép",           "description": "Lắp giàn giáo, khung đỡ thiết bị"},
    # Đường ống
    {"category": "duong_ong","name": "Đường ống môi chất lạnh",         "description": "Lắp đặt đường ống gas, ammoniac"},
    {"category": "duong_ong","name": "Đường ống nước / chiller",        "description": "Lắp đặt đường ống nước lạnh"},
    # Vận hành
    {"category": "van_hanh", "name": "Vận hành kho lạnh",               "description": "Giám sát nhiệt độ, vận hành hệ thống"},
    {"category": "van_hanh", "name": "Bảo trì định kỳ",                 "description": "Bảo trì phòng ngừa thiết bị lạnh / điện"},
    # Quản lý
    {"category": "quan_ly",  "name": "Giám sát thi công",               "description": "Quản lý tiến độ, chất lượng công trình"},
    {"category": "quan_ly",  "name": "Đọc bản vẽ kỹ thuật",             "description": "Đọc hiểu bản vẽ P&ID, CAD"},
    {"category": "quan_ly",  "name": "An toàn lao động",                "description": "Quy trình ATVSLĐ, làm việc trên cao"},
]


def seed_skills_for_company(session: Session, company: Company) -> int:
    """Tạo skill mặc định cho 1 công ty. Trả về số skill được tạo."""
    existing = session.exec(
        select(Skill).where(Skill.company_id == company.id)
    ).first()
    if existing:
        return 0  # đã có → bỏ qua

    count = 0
    for item in DEFAULT_SKILLS:
        skill = Skill(
            company_id=company.id,
            name=item["name"],
            category=item["category"],
            description=item.get("description"),
        )
        session.add(skill)
        count += 1

    session.commit()
    return count


def main() -> None:
    with Session(engine) as session:
        companies = session.exec(select(Company)).all()
        if not companies:
            print("Không tìm thấy công ty nào trong DB.")
            return

        total = 0
        for company in companies:
            created = seed_skills_for_company(session, company)
            if created:
                print(f"  ✓ [{company.name}] Đã tạo {created} kỹ năng mặc định")
            else:
                print(f"  — [{company.name}] Đã có kỹ năng, bỏ qua")
            total += created

        print(f"\nHoàn tất: {total} kỹ năng được tạo trên {len(companies)} công ty.")


if __name__ == "__main__":
    main()
