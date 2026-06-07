"""
Integration test — checking in (company mode) at a CUSTOMER company's site.

Verifies that a worker can check in against a customer company's coordinates
(validated by distance), the record carries customer_company_id, and check-out
re-evaluates against the same customer site.
"""

from __future__ import annotations

import pathlib
import struct
import uuid
import zlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.crud import create_user
from app.models.org import Company, Permission, Role, RolePermission, UserCompanyRole
from app.models.user import User, UserCreate

API = settings.API_V1_STR


@pytest.fixture(scope="module", autouse=True)
def _cleanup_attendance_photos():
    """Delete only the attendance photos created by this module (the upload dir
    also holds real files, so we must not wipe it wholesale)."""
    upload_dir = pathlib.Path(settings.ATTENDANCE_UPLOAD_DIR)
    before = set(upload_dir.glob("*")) if upload_dir.exists() else set()
    yield
    if upload_dir.exists():
        for p in upload_dir.glob("*"):
            if p not in before:
                p.unlink(missing_ok=True)


def _png_bytes() -> bytes:
    """Minimal valid 1x1 PNG so the image content-type check passes."""
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\xff\xff")
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{API}/login/access-token", data={"username": email, "password": password}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def worker_headers(client: TestClient, mdb: Session) -> dict:
    company = Company(
        name=f"AttCo-{uuid.uuid4().hex[:6]}", slug=f"attco-{uuid.uuid4().hex[:6]}"
    )
    mdb.add(company)
    mdb.commit()
    mdb.refresh(company)

    role = Role(
        company_id=company.id,
        name=f"worker_{uuid.uuid4().hex[:6]}",
        display_name="Worker",
        level=3,
        is_system=False,
    )
    mdb.add(role)
    mdb.flush()
    perms = mdb.exec(
        select(Permission).where(
            Permission.code.in_(  # type: ignore[arg-type]
                ["ATTENDANCE_CHECKIN", "CUSTOMER_VIEW", "CUSTOMER_CREATE"]
            )
        )
    ).all()
    for p in perms:
        mdb.add(RolePermission(role_id=role.id, permission_id=p.id))

    pw = "Testpass1!att"
    email = f"att_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(
        session=mdb, user_create=UserCreate(email=email, password=pw, is_active=True)
    )
    user.company_id = company.id
    mdb.add(user)
    mdb.add(
        UserCompanyRole(
            user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True
        )
    )
    mdb.commit()
    return _login(client, email, pw)


def test_check_in_and_out_at_customer_company(
    client: TestClient, worker_headers: dict
) -> None:
    lat, lng = 10.762622, 106.660172

    # Register a customer company with a site at (lat, lng).
    r = client.post(
        f"{API}/customer-companies",
        json={
            "name": f"KH {uuid.uuid4().hex[:6]}",
            "type": "customer",
            "site_lat": lat,
            "site_lng": lng,
            "site_radius_m": 200,
        },
        headers=worker_headers,
    )
    assert r.status_code == 201, r.text
    cc = r.json()

    png = _png_bytes()

    # Check in at the customer site (same coords → valid).
    r = client.post(
        f"{API}/attendance/check-in",
        data={
            "mode": "company",
            "customer_company_id": cc["id"],
            "task_label": "Sửa máy tại khách hàng",
            "lat": str(lat),
            "lng": str(lng),
            "accuracy_m": "10",
        },
        files={"file": ("c.png", png, "image/png")},
        headers=worker_headers,
    )
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["mode"] == "company"
    assert rec["customer_company_id"] == cc["id"]
    assert rec["company_id"] is None
    assert rec["check_in_valid"] is True

    # Check out at the same spot.
    r = client.post(
        f"{API}/attendance/check-out",
        data={
            "record_id": rec["id"],
            "lat": str(lat),
            "lng": str(lng),
            "accuracy_m": "10",
        },
        files={"file": ("c.png", png, "image/png")},
        headers=worker_headers,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["check_out_at"] is not None
    assert out["check_out_valid"] is True


def test_check_in_company_mode_requires_a_target(
    client: TestClient, worker_headers: dict
) -> None:
    r = client.post(
        f"{API}/attendance/check-in",
        data={
            "mode": "company",
            "task_label": "thiếu công ty",
            "lat": "10.0",
            "lng": "106.0",
        },
        files={"file": ("c.png", _png_bytes(), "image/png")},
        headers=worker_headers,
    )
    assert r.status_code == 422
