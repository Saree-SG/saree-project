"""
ONE-TIME production seed for Saree (chạy đúng 1 lần khi khởi tạo hệ thống).

⚠️ HỦY DIỆT: xóa TOÀN BỘ dữ liệu trong DB rồi seed lại từ đầu một tenant đầy đủ:
  - Công ty:      Công Ty TNHH Điện Lạnh SaiGon (slug=saree)
  - Quyền + role hệ thống (gồm các tổ sản xuất) + phòng ban
  - Superuser đầu tiên (lấy từ .env: FIRST_SUPERUSER / FIRST_SUPERUSER_PASSWORD)
  - 9 tài khoản nhân sự (mật khẩu Saree1234!) kèm role + phòng ban + chức danh

Lệnh chạy trên TERMINAL MÁY SERVER (DB đang chạy bằng Docker):

  # Môi trường thường (local/staging)
  docker compose -f compose.yml -f compose.prod.yml exec backend \
    python -m app.scripts.seed_saree_oneshot --confirm

  # Môi trường production (ENVIRONMENT=production) — phải mở khoá ALLOW_RESET=1
  docker compose -f compose.yml -f compose.prod.yml exec -e ALLOW_RESET=1 backend \
    python -m app.scripts.seed_saree_oneshot --confirm

Schema/migrations do `prestart` lo sẵn lúc deploy nên không cần migrate ở đây —
chỉ wipe + seed dữ liệu. KHÔNG chạy lại sau khi đã có người dùng thật.
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

import app.models  # noqa: F401  (đăng ký mọi bảng vào SQLModel.metadata)
from app.core.config import settings
from app.core.db import engine, init_db
from app.models.org import Company
from app.models.user import User
from app.scripts.seed_defaults import (
    SAREE_COMPANY_NAME,
    SAREE_COMPANY_SLUG,
    STAFF_ACCOUNTS,
    STAFF_PASSWORD,
    seed,
    seed_staff_accounts,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ONE-TIME: wipe entire DB and seed Saree company + staff."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Bắt buộc — xác nhận sẽ XÓA TOÀN BỘ dữ liệu.",
    )
    return parser.parse_args()


def assert_reset_allowed() -> None:
    if settings.ENVIRONMENT == "production" and os.environ.get("ALLOW_RESET") != "1":
        print(
            "Từ chối: ENVIRONMENT=production. Đặt ALLOW_RESET=1 nếu bạn THẬT SỰ "
            "muốn xóa sạch DB này.",
            file=sys.stderr,
        )
        sys.exit(1)


def wipe_all(session: Session) -> None:
    """TRUNCATE mọi bảng (CASCADE), trừ alembic_version (giữ lịch sử migration)."""
    table_names = [
        t.name for t in SQLModel.metadata.sorted_tables if t.name != "alembic_version"
    ]
    if not table_names:
        return
    quoted = ", ".join(f'"{name}"' for name in table_names)
    session.connection().execute(
        text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE")
    )
    session.commit()


def main() -> None:
    args = parse_args()
    if not args.confirm:
        print("Từ chối: thêm --confirm để xóa toàn bộ dữ liệu.", file=sys.stderr)
        sys.exit(1)
    assert_reset_allowed()

    with Session(engine) as session:
        print("▶ Xóa toàn bộ dữ liệu…")
        wipe_all(session)
        print("  ✓ Đã xóa sạch")

        # Superuser (từ .env)
        init_db(session)
        admin = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712

        # Công ty
        company = Company(name=SAREE_COMPANY_NAME, slug=SAREE_COMPANY_SLUG)
        session.add(company)
        session.commit()
        session.refresh(company)
        print(f"  ✓ Công ty: {company.name} (slug={company.slug})")

        # Quyền + role + phòng ban + gán superuser làm director
        seed(
            session,
            company.id,
            assign_superuser_director=True,
            assign_superuser_demo_worker=True,
        )

        # 9 tài khoản nhân sự + role + phòng ban
        seed_staff_accounts(
            session, company.id, STAFF_ACCOUNTS, STAFF_PASSWORD, update_existing=True
        )

        # Chức danh (đầy đủ thông tin): đặt job_title = phòng ban / tổ
        for _full_name, email, _role_name, dept_name in STAFF_ACCOUNTS:
            user = session.exec(select(User).where(User.email == email)).first()
            if user is not None:
                user.job_title = dept_name
                session.add(user)
        session.commit()

        # Tổng kết
        print("\n✅ Seed hoàn tất.")
        print(f"   Công ty : {SAREE_COMPANY_NAME} (slug={SAREE_COMPANY_SLUG})")
        if admin:
            print(f"   Superuser: {admin.email} (mật khẩu = FIRST_SUPERUSER_PASSWORD)")
        print(f"\n   {len(STAFF_ACCOUNTS)} tài khoản nhân sự (mật khẩu: {STAFF_PASSWORD}):")
        for full_name, email, role_name, dept_name in STAFF_ACCOUNTS:
            print(f"     - {email:28} | {full_name:24} | {dept_name}")


if __name__ == "__main__":
    main()
