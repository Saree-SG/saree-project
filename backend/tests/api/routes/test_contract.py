"""
Integration tests for Contract — TC-07 (Part A + B).

Coverage:
  - TC-07-01: Tạo hợp đồng từ báo giá S9 (won)
  - TC-07-02: Không tạo hợp đồng từ báo giá chưa won → 400
  - TC-07-03: Xem danh sách hợp đồng
  - TC-07-04: Cập nhật hợp đồng
  - TC-07-05: Không tạo hợp đồng trùng quotation → 409
  - TC-07-06: State machine đầy đủ draft → ... → completed, và các
    transition không hợp lệ bị chặn (400).
  - TC-07-07: Từ chối (reject) đưa hợp đồng về draft.
  - TC-07-08: Timeline (transitions) ghi đúng thứ tự thao tác.
  - TC-07-09: Upload/xóa tài liệu hợp đồng.
  - TC-07-10: Phân quyền — thiếu quyền → 403; khác công ty → 403/404.
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
    "CONTRACT_SUBMIT", "CONTRACT_SIGN", "CONTRACT_CONFIRM_ADVANCE",
    "CONTRACT_START_PRODUCTION", "CONTRACT_COMPLETE",
]
DIRECTOR_PERMS = [
    "QUOTATION_VIEW_ALL", "QUOTATION_APPROVE_SURVEY", "QUOTATION_APPROVE_DESIGN",
    "QUOTATION_APPROVE_FINAL", "QUOTATION_APPROVE_NEGOTIATION",
    "CONTRACT_VIEW_ALL", "CONTRACT_APPROVE",
]
# A role with no CONTRACT_* permission at all, for permission-denial tests.
NO_CONTRACT_PERMS = ["QUOTATION_VIEW"]
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


@pytest.fixture(scope="module")
def outsider_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Outsider", 3, NO_CONTRACT_PERMS)


@pytest.fixture(scope="module")
def outsider_user(mdb: Session, company: Company, outsider_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, outsider_role, "out")


@pytest.fixture(scope="module")
def outsider_headers(client: TestClient, outsider_user: tuple[User, str]) -> dict:
    user, pw = outsider_user
    return _login(client, user.email, pw)


# --- Second (foreign) company, to test cross-company isolation ---

@pytest.fixture(scope="module")
def other_company(mdb: Session) -> Company:
    c = Company(name=f"OtherCo-{uuid.uuid4().hex[:6]}", slug=f"otherco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def other_sales_role(mdb: Session, other_company: Company) -> Role:
    return _make_role(mdb, other_company, "Sales", 2, SALES_PERMS)


@pytest.fixture(scope="module")
def other_sales_user(mdb: Session, other_company: Company, other_sales_role: Role) -> tuple[User, str]:
    return _make_user(mdb, other_company, other_sales_role, "othersales")


@pytest.fixture(scope="module")
def other_sales_headers(client: TestClient, other_sales_user: tuple[User, str]) -> dict:
    user, pw = other_sales_user
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


# ---------------------------------------------------------------------------
# TC-07-06/07: State machine đầy đủ
# ---------------------------------------------------------------------------

class TestContractStateMachine:

    def test_full_lifecycle_draft_to_completed(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-06: draft → pending_approval → sent → signed →
        advance_received → in_production → completed."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]
        assert c["status"] == "draft"

        r = client.post(f"{API}/contracts/{cid}/submit", json={"note": "Trình duyệt"}, headers=sales_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending_approval"

        r = client.post(f"{API}/contracts/{cid}/approve", json={"note": "Duyệt"}, headers=director_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "sent"

        r = client.post(f"{API}/contracts/{cid}/sign",
                         json={"note": "Khách ký", "signing_date": str(date.today())},
                         headers=sales_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "signed"

        r = client.post(f"{API}/contracts/{cid}/confirm-advance",
                         json={
                             "note": "Đã nhận tạm ứng",
                             "advance_amount": 100_000_000,
                             "advance_paid_at": datetime.now(timezone.utc).isoformat(),
                         },
                         headers=sales_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "advance_received"

        r = client.post(f"{API}/contracts/{cid}/start-production",
                         json={"note": "Bắt đầu sản xuất"}, headers=sales_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_production"

        r = client.post(f"{API}/contracts/{cid}/complete",
                         json={"note": "Hoàn thành"}, headers=sales_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed"

        # No transition is valid from a terminal state.
        r = client.post(f"{API}/contracts/{cid}/complete", json={"note": "x"}, headers=sales_headers)
        assert r.status_code == 400

    def test_reject_returns_to_draft(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """TC-07-07: pending_approval --reject--> draft."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]

        r = client.post(f"{API}/contracts/{cid}/submit", json={"note": "Trình duyệt"}, headers=sales_headers)
        assert r.status_code == 200, r.text

        r = client.post(f"{API}/contracts/{cid}/reject", json={"note": "Cần sửa"}, headers=director_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "draft"

        # Rejected contract can be edited again since it's back to draft.
        r = client.patch(f"{API}/contracts/{cid}", json={"notes": "Đã sửa"}, headers=sales_headers)
        assert r.status_code == 200, r.text

    def test_invalid_transition_rejected(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """Skipping a stage (draft --sign--> ...) must be blocked."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        r = client.post(f"{API}/contracts/{c['id']}/sign",
                         json={"note": "x", "signing_date": str(date.today())},
                         headers=sales_headers)
        assert r.status_code == 400

    def test_cannot_update_after_submit(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """Once out of draft, PATCH must be rejected (400)."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]
        r = client.post(f"{API}/contracts/{cid}/submit", json={"note": "Trình duyệt"}, headers=sales_headers)
        assert r.status_code == 200, r.text

        r = client.patch(f"{API}/contracts/{cid}", json={"notes": "x"}, headers=sales_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TC-07-08: Timeline
# ---------------------------------------------------------------------------

class TestContractTimeline:

    def test_transitions_recorded_in_order(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]

        r = client.post(f"{API}/contracts/{cid}/submit", json={"note": "Trình duyệt"}, headers=sales_headers)
        assert r.status_code == 200, r.text
        r = client.post(f"{API}/contracts/{cid}/approve", json={"note": "Duyệt"}, headers=director_headers)
        assert r.status_code == 200, r.text

        r = client.get(f"{API}/contracts/{cid}", headers=sales_headers)
        assert r.status_code == 200
        transitions = r.json()["transitions"]
        actions = [t["action"] for t in transitions]
        assert actions == ["create", "submit", "approve"]
        assert transitions[0]["from_status"] is None
        assert transitions[0]["to_status"] == "draft"
        assert transitions[-1]["to_status"] == "sent"


# ---------------------------------------------------------------------------
# TC-07-09: Tài liệu (attachments)
# ---------------------------------------------------------------------------

class TestContractAttachments:

    def test_upload_and_delete_attachment(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]

        r = client.post(
            f"{API}/contracts/{cid}/attachments/upload",
            files={"file": ("hop_dong.pdf", b"%PDF-1.4 fake content", "application/pdf")},
            headers=sales_headers,
        )
        assert r.status_code == 201, r.text
        att = r.json()
        assert att["file_name"] == "hop_dong.pdf"

        r = client.get(f"{API}/contracts/{cid}", headers=sales_headers)
        assert r.status_code == 200
        assert any(a["id"] == att["id"] for a in r.json()["attachments"])

        r = client.delete(f"{API}/contracts/{cid}/attachments/{att['id']}", headers=sales_headers)
        assert r.status_code == 204

        r = client.get(f"{API}/contracts/{cid}", headers=sales_headers)
        assert r.status_code == 200
        assert all(a["id"] != att["id"] for a in r.json()["attachments"])


# ---------------------------------------------------------------------------
# TC-07-10: Phân quyền
# ---------------------------------------------------------------------------

class TestContractPermissions:

    def test_user_without_permission_cannot_view(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
        outsider_headers: dict,
    ) -> None:
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])

        r = client.get(f"{API}/contracts/{c['id']}", headers=outsider_headers)
        assert r.status_code == 403

        r = client.get(f"{API}/contracts/", headers=outsider_headers)
        assert r.status_code == 403

    def test_user_without_permission_cannot_submit(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
        outsider_headers: dict,
    ) -> None:
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])

        r = client.post(f"{API}/contracts/{c['id']}/submit", json={"note": "x"}, headers=outsider_headers)
        assert r.status_code == 403

    def test_sales_cannot_approve_own_submission(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
    ) -> None:
        """Sales has no CONTRACT_APPROVE — must not be able to self-approve."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])
        cid = c["id"]
        r = client.post(f"{API}/contracts/{cid}/submit", json={"note": "x"}, headers=sales_headers)
        assert r.status_code == 200, r.text

        r = client.post(f"{API}/contracts/{cid}/approve", json={"note": "x"}, headers=sales_headers)
        assert r.status_code == 403

    def test_cross_company_cannot_view_contract(
        self, client: TestClient, sales_headers: dict,
        director_headers: dict, engineer_headers: dict, materials_headers: dict,
        other_sales_headers: dict,
    ) -> None:
        """A user from another company must not see or act on this contract."""
        won = _advance_to_won(client, sales_headers, director_headers, engineer_headers, materials_headers)
        c = _get_contract_for_quotation(client, sales_headers, won["id"])

        r = client.get(f"{API}/contracts/{c['id']}", headers=other_sales_headers)
        assert r.status_code in (403, 404)

        r = client.patch(f"{API}/contracts/{c['id']}", json={"notes": "hack"}, headers=other_sales_headers)
        assert r.status_code in (403, 404)

        # Cross-company list must not leak the contract either.
        r = client.get(f"{API}/contracts/", headers=other_sales_headers)
        assert r.status_code == 200
        body = r.json()
        items = body["data"] if isinstance(body, dict) and "data" in body else body
        assert all(item["id"] != c["id"] for item in items)
