"""
Seed script — Setup công ty khách hàng: Công ty TNHH Điện Lạnh Sài Gòn

Tạo:
  - Company
  - Roles + Permissions + Departments (qua seed_defaults)
  - Tài khoản admin (superuser hiện tại → Director)
  - Tài khoản vuhuynh@saree.com (Director)
  - Tài khoản tuananh@saree.com (Director)
  - Phòng Ban Giám Đốc và gắn 2 tài khoản vào đó

Usage:
    # Dev
    docker exec saree-dev-backend-1 python -m app.scripts.seed_customer

    # Prod
    docker exec saree-prod-backend-1 python -m app.scripts.seed_customer
"""
from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.db import engine
from app.core.security import get_password_hash
from app.models.org import Company, Department, Role, UserCompanyRole
from app.models.user import User
from app.scripts.seed_defaults import seed as seed_defaults

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

COMPANY_NAME = "Công ty TNHH Điện Lạnh Sài Gòn"
COMPANY_SLUG = "saree"

BGD_DEPARTMENT_NAME = "Ban Giám Đốc"

DIRECTOR_ACCOUNTS = [
    {
        "email": "vuhuynh@saree.com",
        "full_name": "Vũ Huỳnh",
        "password": "Saree@2024!",
    },
    {
        "email": "tuananh@saree.com",
        "full_name": "Tuấn Anh",
        "password": "Saree@2024!",
    },
]


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

def main() -> None:
    with Session(engine) as session:

        # 1. Company
        print(f"▶ Ensuring company: {COMPANY_NAME}...")
        company = session.exec(
            select(Company).where(Company.slug == COMPANY_SLUG)
        ).first()
        if not company:
            company = Company(name=COMPANY_NAME, slug=COMPANY_SLUG)
            session.add(company)
            session.commit()
            session.refresh(company)
            print(f"  ✓ Created company: {company.name} ({company.id})")
        else:
            company.name = COMPANY_NAME
            session.add(company)
            session.commit()
            print(f"  ✓ Company exists: {company.name} ({company.id})")

        # 2. Roles + Permissions + Default Departments
        print("▶ Running seed_defaults...")
        seed_defaults(session, company.id, assign_superuser_director=True, assign_superuser_demo_worker=False)

        # 3. Phòng Ban Giám Đốc
        print(f"▶ Ensuring department: {BGD_DEPARTMENT_NAME}...")
        bgd_dept = session.exec(
            select(Department).where(
                Department.company_id == company.id,
                Department.name == BGD_DEPARTMENT_NAME,
            )
        ).first()
        if not bgd_dept:
            bgd_dept = Department(
                company_id=company.id,
                name=BGD_DEPARTMENT_NAME,
                dept_type="office_block",
            )
            session.add(bgd_dept)
            session.commit()
            session.refresh(bgd_dept)
            print(f"  ✓ Created department: {BGD_DEPARTMENT_NAME}")
        else:
            print(f"  ✓ Department exists: {BGD_DEPARTMENT_NAME}")

        # 4. Lấy role Director
        director_role = session.exec(
            select(Role).where(
                Role.company_id == company.id,
                Role.name == "director",
            )
        ).first()
        if not director_role:
            print("  ✗ Director role not found — chạy seed_defaults trước!")
            return

        # 5. Tạo tài khoản Director
        print("▶ Ensuring director accounts...")
        for acc in DIRECTOR_ACCOUNTS:
            user = session.exec(
                select(User).where(User.email == acc["email"])
            ).first()
            if not user:
                user = User(
                    email=acc["email"],
                    full_name=acc["full_name"],
                    hashed_password=get_password_hash(acc["password"]),
                    is_active=True,
                    is_superuser=False,
                    company_id=company.id,
                    department_id=bgd_dept.id,
                    job_title="Giám đốc",
                )
                session.add(user)
                session.commit()
                session.refresh(user)
                print(f"  ✓ Created user: {acc['email']}")
            else:
                user.company_id = company.id
                user.department_id = bgd_dept.id
                user.job_title = "Giám đốc"
                if not user.full_name:
                    user.full_name = acc["full_name"]
                session.add(user)
                session.commit()
                print(f"  ✓ Updated user: {acc['email']}")

            # Gắn role Director
            existing_role = session.exec(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == user.id,
                    UserCompanyRole.company_id == company.id,
                    UserCompanyRole.role_id == director_role.id,
                )
            ).first()
            if not existing_role:
                session.add(UserCompanyRole(
                    user_id=user.id,
                    company_id=company.id,
                    role_id=director_role.id,
                    is_primary=True,
                ))
                session.commit()
                print(f"    → Assigned Director role to {acc['email']}")

        # 6. Gắn superuser vào Ban Giám Đốc
        print("▶ Updating superuser department...")
        superuser = session.exec(
            select(User).where(User.is_superuser == True)  # noqa: E712
        ).first()
        if superuser:
            superuser.department_id = bgd_dept.id
            superuser.job_title = "System Admin"
            session.add(superuser)
            session.commit()
            print(f"  ✓ Superuser ({superuser.email}) → {BGD_DEPARTMENT_NAME}")

        print("\n✅ Seed customer hoàn tất!")
        print(f"   Company  : {COMPANY_NAME}")
        print(f"   Slug     : {COMPANY_SLUG}")
        print(f"   accounts :")
        for acc in DIRECTOR_ACCOUNTS:
            print(f"     - {acc['email']} / {acc['password']} (Giám đốc)")
        print(f"   Superuser: xem GitHub Secret FIRST_SUPERUSER")


if __name__ == "__main__":
    main()
