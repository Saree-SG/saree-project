"""
Destructive FULL reset: truncate EVERY table (except alembic_version), then
recreate the first superuser, the "Công ty Saree" tenant, the standard
roles/departments, and the real staff accounts (password Saree1234!).

Usage:
  uv run python -m app.scripts.reset_saree_accounts --confirm

Blocked in production unless ALLOW_RESET=1. The DB schema (and migration
history) is preserved — only row data is wiped — so no re-migration is needed.

Do NOT run against a production database without a backup.
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import text
from sqlmodel import Session, SQLModel, select

import app.models  # noqa: F401  (register every table on SQLModel.metadata)
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
        description="Wipe the entire DB and reseed Saree company + staff accounts."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required acknowledgement that this wipes ALL data.",
    )
    return parser.parse_args()


def assert_reset_allowed() -> None:
    if settings.ENVIRONMENT == "production" and os.environ.get("ALLOW_RESET") != "1":
        print(
            "Refused: ENVIRONMENT=production. Set ALLOW_RESET=1 only if you intend "
            "to wipe this DB.",
            file=sys.stderr,
        )
        sys.exit(1)


def wipe_all(session: Session) -> None:
    """TRUNCATE every mapped table (CASCADE) except alembic_version."""
    table_names = [
        t.name for t in SQLModel.metadata.sorted_tables if t.name != "alembic_version"
    ]
    if not table_names:
        return
    quoted = ", ".join(f'"{name}"' for name in table_names)
    conn = session.connection()
    conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
    session.commit()


def main() -> None:
    args = parse_args()
    if not args.confirm:
        print("Refused: pass --confirm to wipe ALL data.", file=sys.stderr)
        sys.exit(1)
    assert_reset_allowed()

    with Session(engine) as session:
        print("▶ Wiping ALL tables…")
        wipe_all(session)
        print("  ✓ Wipe complete")

        # Recreate the configured first superuser.
        init_db(session)
        admin = session.exec(select(User).where(User.is_superuser == True)).first()  # noqa: E712
        print(f"  ✓ Superuser: {admin.email if admin else '(none)'}")

        company = Company(name=SAREE_COMPANY_NAME, slug=SAREE_COMPANY_SLUG)
        session.add(company)
        session.commit()
        session.refresh(company)
        print(f"  ✓ Company {company.name} ({company.id})")

        # Permissions + system roles (incl. tổ roles) + departments + superuser director.
        seed(
            session,
            company.id,
            assign_superuser_director=True,
            assign_superuser_demo_worker=True,
        )

        seed_staff_accounts(session, company.id, STAFF_ACCOUNTS, STAFF_PASSWORD)

        print("✅ Saree reset complete.")
        print(f"   Company: {SAREE_COMPANY_NAME} (slug={SAREE_COMPANY_SLUG})")
        print(f"   Staff accounts: {len(STAFF_ACCOUNTS)} (password: {STAFF_PASSWORD})")
        if admin:
            print(f"   Superuser: {admin.email}")


if __name__ == "__main__":
    main()
