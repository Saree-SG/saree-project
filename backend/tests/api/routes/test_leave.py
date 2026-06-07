"""
Integration tests — leave requests (xin nghỉ phép) with the approval chain.

Covers: create + default routing to the director, approve/reject, reject-needs-
reason, cancel, permission gating, half-day day counting, and configuring an
alternate approver so requests route to the configured user instead of directors.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.crud import create_user
from app.models.org import Company, Permission, Role, RolePermission, UserCompanyRole
from app.models.user import UserCreate

API = settings.API_V1_STR


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{API}/login/access-token", data={"username": email, "password": password}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _grant(mdb: Session, role_id: uuid.UUID, codes: list[str]) -> None:
    perms = mdb.exec(
        select(Permission).where(Permission.code.in_(codes))  # type: ignore[arg-type]
    ).all()
    for p in perms:
        mdb.add(RolePermission(role_id=role_id, permission_id=p.id))


def _make_user(
    mdb: Session, client: TestClient, company_id: uuid.UUID, role_id: uuid.UUID
) -> dict:
    pw = "Testpass1!leave"
    email = f"lv_{uuid.uuid4().hex[:8]}@example.com"
    user = create_user(
        session=mdb,
        user_create=UserCreate(email=email, password=pw, is_active=True, full_name=email),
    )
    user.company_id = company_id
    mdb.add(user)
    mdb.add(
        UserCompanyRole(
            user_id=user.id, company_id=company_id, role_id=role_id, is_primary=True
        )
    )
    mdb.commit()
    return _login(client, email, pw)


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def env(client: TestClient, mdb: Session) -> dict:
    """A company with a director, a worker, and a manager (alt approver)."""
    company = Company(
        name=f"LvCo-{uuid.uuid4().hex[:6]}", slug=f"lvco-{uuid.uuid4().hex[:6]}"
    )
    mdb.add(company)
    mdb.commit()
    mdb.refresh(company)

    director_role = Role(
        company_id=company.id, name="director", display_name="Giám đốc", level=1
    )
    worker_role = Role(
        company_id=company.id,
        name=f"worker_{uuid.uuid4().hex[:6]}",
        display_name="Worker",
        level=3,
    )
    manager_role = Role(
        company_id=company.id,
        name=f"mgr_{uuid.uuid4().hex[:6]}",
        display_name="Manager",
        level=2,
    )
    mdb.add_all([director_role, worker_role, manager_role])
    mdb.flush()

    # Workers can create; manager can create + approve. Director bypasses via level 1.
    _grant(mdb, worker_role.id, ["LEAVE_CREATE"])
    _grant(mdb, manager_role.id, ["LEAVE_CREATE", "LEAVE_APPROVE", "LEAVE_VIEW_TEAM"])
    mdb.commit()

    director_headers = _make_user(mdb, client, company.id, director_role.id)
    worker_headers = _make_user(mdb, client, company.id, worker_role.id)
    manager_headers = _make_user(mdb, client, company.id, manager_role.id)

    return {
        "company_id": str(company.id),
        "director": director_headers,
        "worker": worker_headers,
        "manager": manager_headers,
    }


def _me(client: TestClient, headers: dict) -> dict:
    r = client.get(f"{API}/users/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _create_request(client: TestClient, headers: dict, **overrides) -> dict:
    today = date.today()
    payload = {
        "leave_type": "annual",
        "start_date": str(today + timedelta(days=3)),
        "end_date": str(today + timedelta(days=4)),
        "reason": "Việc gia đình",
    }
    payload.update(overrides)
    r = client.post(f"{API}/leave-requests", json=payload, headers=headers)
    return r


# ---------------------------------------------------------------------------
# Create + default routing + approve
# ---------------------------------------------------------------------------
def test_create_and_director_approves(client: TestClient, env: dict) -> None:
    r = _create_request(client, env["worker"])
    assert r.status_code == 201, r.text
    leq = r.json()
    assert leq["status"] == "pending"
    assert leq["num_days"] == 2.0

    # Director sees it in the pending queue and approves it.
    r = client.get(f"{API}/leave-requests/pending", headers=env["director"])
    assert r.status_code == 200, r.text
    pending_ids = [x["id"] for x in r.json()["data"]]
    assert leq["id"] in pending_ids

    r = client.post(
        f"{API}/leave-requests/{leq['id']}/approve",
        json={"note": "OK"},
        headers=env["director"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_reject_requires_reason(client: TestClient, env: dict) -> None:
    r = _create_request(client, env["worker"])
    leq = r.json()

    # Reject without a note → 422.
    r = client.post(
        f"{API}/leave-requests/{leq['id']}/reject",
        json={"note": ""},
        headers=env["director"],
    )
    assert r.status_code == 422

    # Reject with a note → rejected.
    r = client.post(
        f"{API}/leave-requests/{leq['id']}/reject",
        json={"note": "Trùng lịch sản xuất"},
        headers=env["director"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"


def test_worker_cannot_approve(client: TestClient, env: dict) -> None:
    r = _create_request(client, env["worker"])
    leq = r.json()
    # A plain worker lacks LEAVE_APPROVE → 403.
    r = client.post(
        f"{API}/leave-requests/{leq['id']}/approve",
        json={"note": "x"},
        headers=env["worker"],
    )
    assert r.status_code == 403


def test_cancel_own_request(client: TestClient, env: dict) -> None:
    r = _create_request(client, env["worker"])
    leq = r.json()
    r = client.post(
        f"{API}/leave-requests/{leq['id']}/cancel", headers=env["worker"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"


def test_half_day_and_multiday_validation(client: TestClient, env: dict) -> None:
    today = date.today()
    one_day = str(today + timedelta(days=10))
    # Single-day half-day → 0.5 days.
    r = _create_request(
        client,
        env["worker"],
        start_date=one_day,
        end_date=one_day,
        half_day="am",
    )
    assert r.status_code == 201, r.text
    assert r.json()["num_days"] == 0.5

    # half_day on a multi-day range → 422.
    r = _create_request(
        client,
        env["worker"],
        start_date=str(today + timedelta(days=10)),
        end_date=str(today + timedelta(days=12)),
        half_day="pm",
    )
    assert r.status_code == 422


def test_end_before_start_rejected(client: TestClient, env: dict) -> None:
    today = date.today()
    r = _create_request(
        client,
        env["worker"],
        start_date=str(today + timedelta(days=5)),
        end_date=str(today + timedelta(days=2)),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Approver configuration → routes to a configured user instead of directors
# ---------------------------------------------------------------------------
def test_configured_approver_receives_request(client: TestClient, env: dict) -> None:
    manager = _me(client, env["manager"])

    # Director configures the manager as the sole approver.
    r = client.put(
        f"{API}/companies/{env['company_id']}/leave-approver-config",
        json={"items": [{"step_order": 1, "approver_user_id": manager["id"]}]},
        headers=env["director"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["uses_default"] is False

    # New request should now appear in the MANAGER's pending queue and be
    # approvable by the manager.
    r = _create_request(client, env["worker"])
    leq = r.json()

    r = client.get(f"{API}/leave-requests/pending", headers=env["manager"])
    assert r.status_code == 200, r.text
    assert leq["id"] in [x["id"] for x in r.json()["data"]]

    r = client.post(
        f"{API}/leave-requests/{leq['id']}/approve",
        json={"note": "Đồng ý"},
        headers=env["manager"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    # Reset config back to default for any later tests.
    r = client.put(
        f"{API}/companies/{env['company_id']}/leave-approver-config",
        json={"items": []},
        headers=env["director"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["uses_default"] is True


def test_config_requires_exactly_one_target(client: TestClient, env: dict) -> None:
    # Neither role nor user set → 422.
    r = client.put(
        f"{API}/companies/{env['company_id']}/leave-approver-config",
        json={"items": [{"step_order": 1}]},
        headers=env["director"],
    )
    assert r.status_code == 422
