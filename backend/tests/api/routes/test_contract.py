"""
Integration tests for Contract — TC-07 (Part A).

Coverage:
  - TC-07-01: Tạo hợp đồng từ báo giá S9 (won)
  - TC-07-02: Không tạo hợp đồng từ báo giá chưa won → 400
  - TC-07-03: Xem danh sách hợp đồng
  - TC-07-04: Cập nhật hợp đồng
  - TC-07-05: Không tạo hợp đồng trùng quotation → 409
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.crud import create_user
from app.models.org import Company, Permission, Role, RolePermission, UserCompanyRole
from app.models.user import User, UserCreate

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# Helpers (mirrors test_quotation.py pattern)
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_role(mdb: Session, company: Company, display: str, level: int, perm_codes: list[str]) -> Role:
    role = Role(
        company_id=company.id,
        name=f"{display.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
        display_name=display,
        level=level,
        is_system=False,
    )
    mdb.add(role)
    mdb.flush()
    perms = mdb.exec(select(Permission).where(Permission.code.in_(perm_codes))).all()  # type: ignore[arg-type]
    for p in perms:
        mdb.add(RolePermission(role_id=role.id, permission_id=p.id))
    mdb.commit()
    mdb.refresh(role)
    return role


def _make_user(mdb: Session, company: Company, role: Role, suffix: str) -> tuple[User, str]:
    password = f"Testpass1!{suffix}"
    email = f"test_ct_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


# Quotation pipeline helpers

def _create_quotation(client: TestClient, headers: dict) -> dict:
    r = client.post(f"{API}/quotations/", json={
        "project_name": f"Project-{uuid.uuid4().hex[:6]}",
        "client_company_name": "Khách Hàng ABC",
        "equipment_category": "dieu_hoa",
    }, headers=headers)
    assert r.status_code == 201, f"create_quotation: {r.text}"
    return r.json()


def _add_attachment(client, qid, stage_name: str, headers) -> None:
    r = client.post(f"{API}/quotations/{qid}/attachments", json={
        "file_url": f"https://storage.example.com/{stage_name}.pdf",
        "file_name": f"{stage_name}.pdf",
        "file_type": "document",
        "document_category": "technical",
    }, headers=headers)
    assert r.status_code == 201, f"add_attachment ({stage_name}): {r.text}"


def _advance_to_won(
    client: TestClient,
    sales_h: dict, director_h: dict, engineer_h: dict, materials_h: dict,
) -> dict:
    """Create a new quotation and advance all the way to S9 won."""
    q = _create_quotation(client, sales_h)
    qid = q["id"]

    # S1 → S2
    r = client.post(f"{API}/quotations/{qid}/submit-survey", json={
        "client_contact_name": "Nguyen Van A",
        "site_survey_date": str(date.today()),
        "note": "OK",
    }, headers=sales_h)
    assert r.status_code == 200, r.text

    # S2 → S3
    r = client.post(f"{API}/quotations/{qid}/approve-survey",
                    json={"action": "approve", "note": "OK"}, headers=director_h)
    assert r.status_code == 200, r.text

    # S3 → S3B
    _add_attachment(client, qid, "S3_TECH_DESIGN", engineer_h)
    r = client.post(f"{API}/quotations/{qid}/submit-design",
                    json={"note": "Thiết kế xong"}, headers=engineer_h)
    assert r.status_code == 200, r.text

    r = client.post(f"{API}/quotations/{qid}/submit-boc-tach",
                    json={"note": "Bóc tách xong"}, headers=engineer_h)
    assert r.status_code == 200, r.text

    # S3B → S4 → S5
    r = client.post(f"{API}/quotations/{qid}/approve-design",
                    json={"action": "approve", "note": "OK"}, headers=director_h)
    assert r.status_code == 200, r.text

    _add_attachment(client, qid, "S5_PROCUREMENT_PRICING", materials_h)
    r = client.post(f"{API}/quotations/{qid}/submit-pricing",
                    json={"total_contract_value": 500000000, "note": "Đã điền giá"}, headers=materials_h)
    assert r.status_code == 200, r.text

    # S5 → S6 → S7
    _add_attachment(client, qid, "S6_SALES_FINALIZE", sales_h)
    r = client.post(f"{API}/quotations/{qid}/finalize",
                    json={"note": "Xong"}, headers=sales_h)
    assert r.status_code == 200, r.text

    r = client.post(f"{API}/quotations/{qid}/approve-final",
                    json={"action": "approve", "note": "Duyệt"}, headers=director_h)
    assert r.status_code == 200, r.text

    # S7 → S8
    r = client.post(f"{API}/quotations/{qid}/send-to-client", json={
        "valid_until": str(date.today() + timedelta(days=30)),
        "note": "Gửi khách",
    }, headers=sales_h)
    assert r.status_code == 200, r.text

    # S8 → S9 (won)
    r = client.post(f"{API}/quotations/{qid}/close",
                    json={"outcome": "won"}, headers=sales_h)
    assert r.status_code == 200, r.text
    won = r.json()
    assert won["outcome"] == "won"
    return won


def _create_contract(client: TestClient, headers: dict, quotation_id: str) -> dict:
    r = client.post(f"{API}/contracts/", json={
        "quotation_id": quotation_id,
        "contract_date": str(date.today()),
        "total_value": 500_000_000,
        "currency": "VND",
        "notes": "Hợp đồng thử nghiệm",
    }, headers=headers)
    assert r.status_code == 201, f"create_contract failed: {r.text}"
    return r.json()


def _get_contract_for_quotation(client: TestClient, headers: dict, quotation_id: str) -> dict:
    """Retrieve the auto-created contract for a won quotation."""
    r = client.get(f"{API}/contracts/", headers=headers)
    assert r.status_code == 200
    items = r.json().get("data") or r.json()
    match = next((c for c in items if c["quotation_id"] == quotation_id), None)
    assert match is not None, f"No contract found for quotation {quotation_id}"
    return match


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"ContractCo-{uuid.uuid4().hex[:6]}", slug=f"contractco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


SALES_PERMS = [
    "QUOTATION_CREATE", "QUOTATION_VIEW", "QUOTATION_UPDATE",
    "QUOTATION_SUBMIT_SURVEY", "QUOTATION_FINALIZE",
    "QUOTATION_SEND_CLIENT", "QUOTATION_LOG_NEGOTIATION", "QUOTATION_CLOSE",
    "CONTRACT_CREATE", "CONTRACT_VIEW", "CONTRACT_UPDATE",
]
DIRECTOR_PERMS = [
    "QUOTATION_VIEW_ALL", "QUOTATION_APPROVE_SURVEY", "QUOTATION_APPROVE_DESIGN",
    "QUOTATION_APPROVE_FINAL", "QUOTATION_APPROVE_NEGOTIATION",
    "CONTRACT_VIEW_ALL",
]
ENGINEER_PERMS = ["QUOTATION_VIEW", "QUOTATION_DESIGN", "QUOTATION_BOC_TACH"]
MATERIALS_PERMS = ["QUOTATION_VIEW", "QUOTATION_FILL_PRICE"]


@pytest.fixture(scope="module")
def sales_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Sales", 2, SALES_PERMS)


@pytest.fixture(scope="module")
def director_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Director", 1, DIRECTOR_PERMS)


@pytest.fixture(scope="module")
def engineer_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Engineer", 2, ENGINEER_PERMS)


@pytest.fixture(scope="module")
def materials_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Materials", 2, MATERIALS_PERMS)


@pytest.fixture(scope="module")
def sales_user(mdb: Session, company: Company, sales_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, sales_role, "sales")


@pytest.fixture(scope="module")
def director_user(mdb: Session, company: Company, director_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, director_role, "dir")


@pytest.fixture(scope="module")
def engineer_user(mdb: Session, company: Company, engineer_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, engineer_role, "eng")


@pytest.fixture(scope="module")
def materials_user(mdb: Session, company: Company, materials_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, materials_role, "mat")


@pytest.fixture(scope="module")
def sales_headers(client: TestClient, sales_user: tuple[User, str]) -> dict:
    user, pw = sales_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def director_headers(client: TestClient, director_user: tuple[User, str]) -> dict:
    user, pw = director_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def engineer_headers(client: TestClient, engineer_user: tuple[User, str]) -> dict:
    user, pw = engineer_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def materials_headers(client: TestClient, materials_user: tuple[User, str]) -> dict:
    user, pw = materials_user
    return _login(client, user.email, pw)


# ---------------------------------------------------------------------------
# TC-07-01/02/05: Create
# ---------------------------------------------------------------------------

class TestContractCreate:

    def test_close_won_auto_creates_contract(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-01: close_won tự động tạo hợp đồng → có thể xem qua GET /contracts/."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        assert c["quotation_id"] == won["id"]
        assert c["status"] == "draft"
        assert "contract_number" in c

    def test_cannot_create_duplicate_contract(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-05: Hợp đồng trùng quotation → 409."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        # close_won already created a contract; try again → 409
        r = client.post(f"{API}/contracts/", json={
            "quotation_id": won["id"],
            "contract_date": str(date.today()),
            "total_value": 500_000_000,
        }, headers=sales_headers)
        assert r.status_code == 409

    def test_cannot_create_contract_from_non_won_quotation(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        """TC-07-02: Báo giá không won → 400."""
        q = _create_quotation(client, sales_headers)
        r = client.post(f"{API}/contracts/", json={
            "quotation_id": q["id"],
            "contract_date": str(date.today()),
            "total_value": 100_000_000,
        }, headers=sales_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TC-07-03: Xem danh sách hợp đồng
# ---------------------------------------------------------------------------

class TestContractList:

    def test_list_contracts_returns_results(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-03: GET /contracts/ trả về danh sách."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        r = client.get(f"{API}/contracts/", headers=sales_headers)
        assert r.status_code == 200
        items = r.json().get("data") or r.json()
        assert isinstance(items, list)
        assert any(c["quotation_id"] == won["id"] for c in items)

    def test_get_contract_by_id(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-03b: GET /contracts/{id} trả về chi tiết."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        r = client.get(f"{API}/contracts/{c['id']}", headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["id"] == c["id"]


# ---------------------------------------------------------------------------
# TC-07-04: Cập nhật hợp đồng
# ---------------------------------------------------------------------------

class TestContractUpdate:

    def test_update_contract_value(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-04: PATCH contract → total_value cập nhật đúng."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        r = client.patch(f"{API}/contracts/{c['id']}",
                         json={"total_value": 550_000_000}, headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["total_value"] == 550_000_000

    def test_update_contract_notes(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-04b: PATCH contract → notes cập nhật đúng."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        new_notes = "Ghi chú cập nhật"
        r = client.patch(f"{API}/contracts/{c['id']}",
                         json={"notes": new_notes}, headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["notes"] == new_notes
