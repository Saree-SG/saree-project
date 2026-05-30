"""
Integration tests for Quotation workflow — TC-02.

Coverage:
  - Happy path: S1 → S2 → S3 → S3B → S4 → S5 → S6 → S7 → S8 → S9 (won)
  - Reject at S2: director rejects → back to S1
  - Reject at S4: director rejects → back to S3B
  - Reject at S7: director rejects → back to S6
  - Close lost at S8
  - Multi-approver: co_approver can approve on behalf of director
  - Delegate: delegate can approve and it counts as main approval
  - Non-director cannot use approval endpoints (403)
  - Creating contract from non-S9 quotation fails (TC-07-02)
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
# Helpers
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
    email = f"test_q_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


# ---------------------------------------------------------------------------
# Module-scoped DB session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"QuoteCo-{uuid.uuid4().hex[:6]}", slug=f"quoteco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


SALES_PERMS = [
    "QUOTATION_CREATE", "QUOTATION_VIEW", "QUOTATION_UPDATE",
    "QUOTATION_SUBMIT_SURVEY", "QUOTATION_FINALIZE",
    "QUOTATION_SEND_CLIENT", "QUOTATION_LOG_NEGOTIATION", "QUOTATION_CLOSE",
    "CONTRACT_CREATE",
]
DIRECTOR_PERMS = [
    "QUOTATION_VIEW_ALL", "QUOTATION_APPROVE_SURVEY", "QUOTATION_APPROVE_DESIGN",
    "QUOTATION_APPROVE_FINAL", "QUOTATION_APPROVE_NEGOTIATION",
    "QUOTATION_DELETE", "QUOTATION_REPORT",
]
ENGINEER_PERMS = [
    "QUOTATION_VIEW", "QUOTATION_DESIGN", "QUOTATION_BOC_TACH",
]
MATERIALS_PERMS = [
    "QUOTATION_VIEW", "QUOTATION_FILL_PRICE",
]


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
    _, pw = sales_user
    user, _ = sales_user
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
# Helper: advance quotation through stages
# ---------------------------------------------------------------------------

def _create_quotation(client: TestClient, headers: dict, project_name: str | None = None) -> dict:
    name = project_name or f"Project-{uuid.uuid4().hex[:6]}"
    r = client.post(f"{API}/quotations/", json={
        "project_name": name,
        "client_company_name": "Khách Hàng ABC",
        "equipment_category": "dieu_hoa",
    }, headers=headers)
    assert r.status_code == 201, f"create_quotation failed: {r.text}"
    return r.json()


def _submit_survey(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/submit-survey", json={
        "client_contact_name": "Nguyen Van A",
        "site_survey_date": str(date.today()),
        "note": "Khảo sát xong",
    }, headers=headers)
    assert r.status_code == 200, f"submit_survey failed: {r.text}"
    return r.json()


def _approve_survey(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/approve-survey",
                    json={"action": "approve", "note": "OK"}, headers=headers)
    assert r.status_code == 200, f"approve_survey failed: {r.text}"
    return r.json()


def _add_attachment(client, qid, stage_name: str, headers) -> None:
    """Add a dummy attachment so stage-validation passes."""
    r = client.post(f"{API}/quotations/{qid}/attachments", json={
        "file_url": f"https://storage.example.com/{stage_name}.pdf",
        "file_name": f"{stage_name}.pdf",
        "file_type": "document",
        "document_category": "technical",
    }, headers=headers)
    assert r.status_code == 201, f"add_attachment failed ({stage_name}): {r.text}"


def _submit_design(client, qid, headers) -> dict:
    _add_attachment(client, qid, "S3_TECH_DESIGN", headers)
    r = client.post(f"{API}/quotations/{qid}/submit-design",
                    json={"note": "Thiết kế xong"}, headers=headers)
    assert r.status_code == 200, f"submit_design failed: {r.text}"
    return r.json()


def _submit_boc_tach(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/submit-boc-tach",
                    json={"note": "Bóc tách xong"}, headers=headers)
    assert r.status_code == 200, f"submit_boc_tach failed: {r.text}"
    return r.json()


def _approve_design(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/approve-design",
                    json={"action": "approve", "note": "OK thiết kế"}, headers=headers)
    assert r.status_code == 200, f"approve_design failed: {r.text}"
    return r.json()


def _submit_pricing(client, qid, headers) -> dict:
    _add_attachment(client, qid, "S5_PROCUREMENT_PRICING", headers)
    r = client.post(f"{API}/quotations/{qid}/submit-pricing",
                    json={"total_contract_value": 500000000, "note": "Đã điền giá"}, headers=headers)
    assert r.status_code == 200, f"submit_pricing failed: {r.text}"
    return r.json()


def _finalize(client, qid, headers) -> dict:
    _add_attachment(client, qid, "S6_SALES_FINALIZE", headers)
    r = client.post(f"{API}/quotations/{qid}/finalize",
                    json={"note": "Hoàn thiện chào giá"}, headers=headers)
    assert r.status_code == 200, f"finalize failed: {r.text}"
    return r.json()


def _approve_final(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/approve-final",
                    json={"action": "approve", "note": "Duyệt cuối"}, headers=headers)
    assert r.status_code == 200, f"approve_final failed: {r.text}"
    return r.json()


def _send_to_client(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/send-to-client", json={
        "valid_until": str(date.today() + timedelta(days=30)),
        "note": "Đã gửi khách",
    }, headers=headers)
    assert r.status_code == 200, f"send_to_client failed: {r.text}"
    return r.json()


def _close_won(client, qid, headers) -> dict:
    r = client.post(f"{API}/quotations/{qid}/close",
                    json={"outcome": "won"}, headers=headers)
    assert r.status_code == 200, f"close_won failed: {r.text}"
    return r.json()


def _advance_to_s8(client, qid, sales_h, director_h, engineer_h, materials_h) -> dict:
    """Advance a quotation from S1 all the way to S8."""
    _submit_survey(client, qid, sales_h)
    _approve_survey(client, qid, director_h)
    _submit_design(client, qid, engineer_h)
    _submit_boc_tach(client, qid, engineer_h)
    _approve_design(client, qid, director_h)
    _submit_pricing(client, qid, materials_h)
    _finalize(client, qid, sales_h)
    _approve_final(client, qid, director_h)
    return _send_to_client(client, qid, sales_h)


# ---------------------------------------------------------------------------
# TC-02-01: Happy path S1 → S9 (won)
# ---------------------------------------------------------------------------

class TestQuotationHappyPath:
    """TC-02-01 to TC-02-09: full pipeline S1→S9."""

    def test_create_quotation_starts_at_s1(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        """TC-02-01: Tạo báo giá mới → S1_SALES_COLLECT."""
        q = _create_quotation(client, sales_headers)
        assert q["current_stage"] == "S1_SALES_COLLECT"
        assert q["status"] == "draft"

    def test_submit_survey_s1_to_s2(
        self, client: TestClient, sales_headers: dict, director_headers: dict
    ) -> None:
        """TC-02-02: S1 → S2 sau khi KD nộp khảo sát."""
        q = _create_quotation(client, sales_headers)
        q2 = _submit_survey(client, q["id"], sales_headers)
        assert q2["current_stage"] == "S2_DIRECTOR_APPROVE_SURVEY"

    def test_approve_survey_s2_to_s3(
        self, client: TestClient, sales_headers: dict, director_headers: dict
    ) -> None:
        """TC-02-03: S2 → S3 sau khi GĐ duyệt khảo sát."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        q3 = _approve_survey(client, q["id"], director_headers)
        assert q3["current_stage"] == "S3_TECH_DESIGN"

    def test_full_happy_path_to_s9_won(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-09: Toàn bộ pipeline S1→S9 won → project được tạo."""
        q = _create_quotation(client, sales_headers)
        q8 = _advance_to_s8(
            client, q["id"],
            sales_headers, director_headers, engineer_headers, materials_headers
        )
        assert q8["current_stage"] == "S8_SENT_TO_CLIENT"

        q9 = _close_won(client, q["id"], sales_headers)
        assert q9["current_stage"] == "S9_CLOSED"
        assert q9["outcome"] == "won"
        assert q9["won_project_id"] is not None, "Đóng won phải tạo project"

    def test_close_lost_at_s8(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-10: Đóng lost ở S8 → outcome=lost, không tạo project."""
        q = _create_quotation(client, sales_headers)
        _advance_to_s8(client, q["id"], sales_headers, director_headers, engineer_headers, materials_headers)
        r = client.post(f"{API}/quotations/{q['id']}/close", json={
            "outcome": "lost",
            "lost_reason_category": "price",
            "lost_reason_detail": "Giá cao hơn đối thủ",
        }, headers=sales_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["outcome"] == "lost"
        assert data["won_project_id"] is None


# ---------------------------------------------------------------------------
# TC-02-11 to TC-02-14: Reject flows
# ---------------------------------------------------------------------------

class TestQuotationRejectFlow:
    """Director rejects → stage rolls back."""

    def test_reject_at_s2_returns_to_s1(
        self, client: TestClient, sales_headers: dict, director_headers: dict
    ) -> None:
        """TC-02-11: GĐ từ chối S2 → quay về S1."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        r = client.post(f"{API}/quotations/{q['id']}/approve-survey",
                        json={"action": "reject", "note": "Cần bổ sung thông tin"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S1_SALES_COLLECT"

    def test_reject_at_s4_returns_to_s3b(
        self, client: TestClient, sales_headers: dict, director_headers: dict,
        engineer_headers: dict
    ) -> None:
        """TC-02-12: GĐ từ chối S4 → quay về S3B."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        _approve_survey(client, q["id"], director_headers)
        _submit_design(client, q["id"], engineer_headers)
        _submit_boc_tach(client, q["id"], engineer_headers)
        r = client.post(f"{API}/quotations/{q['id']}/approve-design",
                        json={"action": "reject", "note": "Thiết kế chưa đủ"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S3B_BOC_TACH"

    def test_reject_at_s7_returns_to_s6(
        self, client: TestClient, sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-13: GĐ từ chối S7 → quay về S6."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        _approve_survey(client, q["id"], director_headers)
        _submit_design(client, q["id"], engineer_headers)
        _submit_boc_tach(client, q["id"], engineer_headers)
        _approve_design(client, q["id"], director_headers)
        _submit_pricing(client, q["id"], materials_headers)
        _finalize(client, q["id"], sales_headers)
        r = client.post(f"{API}/quotations/{q['id']}/approve-final",
                        json={"action": "reject", "note": "Giá chưa phù hợp"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S6_SALES_FINALIZE"

    def test_wrong_role_cannot_approve(
        self, client: TestClient, sales_headers: dict, engineer_headers: dict
    ) -> None:
        """TC-02-14: Sales không có quyền duyệt S2 → 403."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        r = client.post(f"{API}/quotations/{q['id']}/approve-survey",
                        json={"action": "approve"}, headers=engineer_headers)
        assert r.status_code == 403

    def test_sales_cannot_approve_final(
        self, client: TestClient, sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-15: Sales không được duyệt S7 → 403."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)
        _approve_survey(client, q["id"], director_headers)
        _submit_design(client, q["id"], engineer_headers)
        _submit_boc_tach(client, q["id"], engineer_headers)
        _approve_design(client, q["id"], director_headers)
        _submit_pricing(client, q["id"], materials_headers)
        _finalize(client, q["id"], sales_headers)
        r = client.post(f"{API}/quotations/{q['id']}/approve-final",
                        json={"action": "approve"}, headers=sales_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-02-11: Revision sau reject — update & re-submit
# ---------------------------------------------------------------------------

class TestQuotationRevision:

    def test_update_quotation_after_reject_and_resubmit(
        self, client: TestClient, sales_headers: dict, director_headers: dict
    ) -> None:
        """TC-02-11: Sau khi GĐ reject S2 → KD cập nhật và submit lại."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)

        # Director rejects → back to S1
        r = client.post(f"{API}/quotations/{q['id']}/approve-survey",
                        json={"action": "reject", "note": "Cần bổ sung"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S1_SALES_COLLECT"

        # Sales updates quotation info
        r2 = client.patch(f"{API}/quotations/{q['id']}",
                          json={"client_contact_name": "Updated Contact"}, headers=sales_headers)
        assert r2.status_code == 200

        # Sales re-submits survey
        q3 = _submit_survey(client, q["id"], sales_headers)
        assert q3["current_stage"] == "S2_DIRECTOR_APPROVE_SURVEY"

    def test_quotation_update_fields(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        """TC-02: PATCH /quotations/{id} cập nhật đúng field."""
        q = _create_quotation(client, sales_headers)
        r = client.patch(f"{API}/quotations/{q['id']}",
                         json={"project_name": "Updated Project Name"}, headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["project_name"] == "Updated Project Name"


# ---------------------------------------------------------------------------
# TC-02-16 to TC-02-18: Multi-approver (co_approver / delegate)
# ---------------------------------------------------------------------------

class TestMultiApprover:
    """Co-approver và delegate flows."""

    def test_co_approver_can_approve_on_behalf(
        self, client: TestClient, mdb: Session,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, company: Company, director_role: Role
    ) -> None:
        """TC-02-16: co_approver flow — director approve (records primary) + co_approver approve → advance."""
        co_user, co_pw = _make_user(mdb, company, director_role, "co")
        co_headers = _login(client, co_user.email, co_pw)

        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)

        # Director thêm co_approver
        r = client.post(f"{API}/quotations/{q['id']}/approval-participants", json={
            "user_id": str(co_user.id),
            "role": "co_approver",
        }, headers=director_headers)
        assert r.status_code == 201

        # Director gọi approve-survey → có co_approver nên chỉ ghi primary, chưa advance
        r = client.post(f"{API}/quotations/{q['id']}/approve-survey",
                        json={"action": "approve", "note": "Director OK"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S2_DIRECTOR_APPROVE_SURVEY", \
            "Khi có co_approver chưa approve, stage không chuyển dù director đã approve"

        # co_approver duyệt → cả hai đã OK → stage chuyển
        r = client.post(f"{API}/quotations/{q['id']}/participant-approve",
                        json={"note": "co-approver OK"}, headers=co_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S3_TECH_DESIGN", \
            "Sau khi co_approver approve, stage mới chuyển"

    def test_delegate_can_approve(
        self, client: TestClient, mdb: Session,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, company: Company, director_role: Role
    ) -> None:
        """TC-02-17: delegate được ủy quyền có thể duyệt và stage chuyển."""
        delegate_user, delegate_pw = _make_user(mdb, company, director_role, "del")
        delegate_headers = _login(client, delegate_user.email, delegate_pw)

        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)

        # Director thêm delegate
        r = client.post(f"{API}/quotations/{q['id']}/approval-participants", json={
            "user_id": str(delegate_user.id),
            "role": "delegate",
        }, headers=director_headers)
        assert r.status_code == 201

        # Delegate duyệt
        r = client.post(f"{API}/quotations/{q['id']}/participant-approve",
                        json={}, headers=delegate_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S3_TECH_DESIGN"

    def test_non_participant_cannot_participant_approve(
        self, client: TestClient,
        sales_headers: dict, engineer_headers: dict
    ) -> None:
        """TC-02-18: User không trong danh sách approval-participants → 403/422."""
        q = _create_quotation(client, sales_headers)
        _submit_survey(client, q["id"], sales_headers)

        # Engineer không phải participant → không được dùng endpoint này
        r = client.post(f"{API}/quotations/{q['id']}/participant-approve",
                        json={}, headers=engineer_headers)
        assert r.status_code in (403, 422)


# ---------------------------------------------------------------------------
# TC-02-19: Negotiation flow
# ---------------------------------------------------------------------------

class TestNegotiationFlow:
    """S8 → S8B → S9 qua thương lượng."""

    def test_submit_and_approve_negotiation(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-19: S8 → S8B (thương lượng) → S8 (GĐ duyệt) → S9."""
        q = _create_quotation(client, sales_headers)
        _advance_to_s8(client, q["id"], sales_headers, director_headers, engineer_headers, materials_headers)

        # Nộp thương lượng → S8B
        r = client.post(f"{API}/quotations/{q['id']}/submit-negotiation",
                        json={"note": "KH yêu cầu giảm 5%"}, headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S8B_NEGOTIATION_REVIEW"

        # GĐ đồng ý điều chỉnh giá → quay về S6 để làm lại bảng giá
        r = client.post(f"{API}/quotations/{q['id']}/approve-negotiation",
                        json={"action": "approve", "note": "Đồng ý giảm 5%"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S6_SALES_FINALIZE", \
            "Approve negotiation → quay S6 để cập nhật bảng giá"

    def test_reject_negotiation_stays_at_s8(
        self, client: TestClient,
        sales_headers: dict, director_headers: dict,
        engineer_headers: dict, materials_headers: dict
    ) -> None:
        """TC-02-20: GĐ không đồng ý thương lượng → ở lại S8 chờ tiếp."""
        q = _create_quotation(client, sales_headers)
        _advance_to_s8(client, q["id"], sales_headers, director_headers, engineer_headers, materials_headers)

        client.post(f"{API}/quotations/{q['id']}/submit-negotiation",
                    json={"note": "Thương lượng lần 2"}, headers=sales_headers)

        r = client.post(f"{API}/quotations/{q['id']}/approve-negotiation",
                        json={"action": "reject", "note": "Không đồng ý"}, headers=director_headers)
        assert r.status_code == 200
        assert r.json()["current_stage"] == "S8_SENT_TO_CLIENT", \
            "Reject negotiation → giữ ở S8 tiếp tục chờ"


# ---------------------------------------------------------------------------
# TC-02-21: Không tạo hợp đồng từ báo giá chưa S9 (TC-07-02)
# ---------------------------------------------------------------------------

class TestContractFromQuotation:
    """Hợp đồng chỉ được tạo từ báo giá đã ở S9."""

    def test_cannot_create_contract_from_non_s9(
        self, client: TestClient, sales_headers: dict, director_headers: dict
    ) -> None:
        """TC-07-02: Báo giá ở S7 → tạo hợp đồng → 422."""
        q = _create_quotation(client, sales_headers)
        # Chỉ advance đến S2 (chưa S9)
        _submit_survey(client, q["id"], sales_headers)

        r = client.post(f"{API}/contracts/", json={
            "quotation_id": q["id"],
            "value": 500000000,
            "signed_date": str(date.today()),
            "start_date": str(date.today() + timedelta(days=10)),
            "end_date": str(date.today() + timedelta(days=100)),
        }, headers=sales_headers)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_list_quotations_returns_items(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        """TC-02 misc: List endpoint hoạt động."""
        _create_quotation(client, sales_headers)
        r = client.get(f"{API}/quotations/", headers=sales_headers)
        assert r.status_code == 200
        assert "data" in r.json() or isinstance(r.json(), (list, dict))
