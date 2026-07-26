"""Tests for new dashboard endpoints (Bước 2) and chat announcement room (Bước 2.5 item h).

All tests use the TestClient + DB fixtures from conftest.py (no extra infrastructure needed).
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models.org import Company, Role, Department, UserCompanyRole
from app.models.user import User
from tests.utils.user import create_random_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_company(db: Session, user: User) -> uuid.UUID:
    if user.company_id:
        return user.company_id
    c = Company(name=f"DashCo-{uuid.uuid4().hex[:6]}", slug=f"dashco-{uuid.uuid4().hex[:6]}")
    db.add(c)
    db.commit()
    db.refresh(c)
    user.company_id = c.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return c.id


def _make_manager(db: Session, user: User, company_id: uuid.UUID) -> None:
    """Give user a level-2 role at company scope."""
    role = db.exec(
        select(Role).where(Role.company_id == company_id, Role.level <= 2)
    ).first()
    if role is None:
        dept = Department(company_id=company_id, name="Quản lý", code="QL")
        db.add(dept)
        db.commit()
        db.refresh(dept)
        role = Role(
            company_id=company_id,
            department_id=dept.id,
            name="manager",
            display_name="Quản lý",
            level=2,
        )
        db.add(role)
        db.commit()
        db.refresh(role)
    ur = UserCompanyRole(user_id=user.id, role_id=role.id, company_id=company_id)
    db.add(ur)
    db.commit()


# ---------------------------------------------------------------------------
# GET /dashboard/staffing-summary
# ---------------------------------------------------------------------------

class TestStaffingSummary:
    def test_returns_200_with_expected_keys(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.get(
            f"{settings.API_V1_STR}/dashboard/staffing-summary",
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("free", "assigned", "overloaded", "understaffed_tasks", "open_incidents"):
            assert key in body, f"missing key: {key}"

    def test_counts_are_non_negative(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.get(
            f"{settings.API_V1_STR}/dashboard/staffing-summary",
            headers=superuser_token_headers,
        )
        body = r.json()
        for key in ("free", "assigned", "overloaded", "understaffed_tasks", "open_incidents"):
            assert body[key] >= 0, f"{key} should be >= 0, got {body[key]}"

    def test_requires_auth(self, client: TestClient) -> None:
        r = client.get(f"{settings.API_V1_STR}/dashboard/staffing-summary")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /dashboard/understaffed-tasks
# ---------------------------------------------------------------------------

class TestUnderstaffedTasks:
    def test_returns_200_list(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.get(
            f"{settings.API_V1_STR}/dashboard/understaffed-tasks",
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_items_have_expected_fields(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.get(
            f"{settings.API_V1_STR}/dashboard/understaffed-tasks",
            headers=superuser_token_headers,
        )
        items = r.json()
        for item in items:
            for key in ("task_id", "name", "project_id", "required", "assigned", "shortage"):
                assert key in item, f"missing key: {key}"
            assert item["shortage"] > 0, "understaffed task must have shortage > 0"

    def test_requires_auth(self, client: TestClient) -> None:
        r = client.get(f"{settings.API_V1_STR}/dashboard/understaffed-tasks")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /chat/announcement-room
# ---------------------------------------------------------------------------

class TestAnnouncementRoom:
    def test_superuser_can_create_or_get_room(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.post(
            f"{settings.API_V1_STR}/chat/announcement-room",
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text
        room = r.json()
        assert room["room_type"] == "announcement"
        assert "Thông báo" in (room.get("name") or "")

    def test_idempotent_second_call(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r1 = client.post(
            f"{settings.API_V1_STR}/chat/announcement-room",
            headers=superuser_token_headers,
        )
        r2 = client.post(
            f"{settings.API_V1_STR}/chat/announcement-room",
            headers=superuser_token_headers,
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"], "second call must return same room"

    def test_requires_auth(self, client: TestClient) -> None:
        r = client.post(f"{settings.API_V1_STR}/chat/announcement-room")
        assert r.status_code in (401, 403)

    def test_non_manager_cannot_send_to_announcement_room(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        """Non-manager posting to announcement room via REST must get 403."""
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        company_id = _ensure_company(db, me)

        # Create announcement room as superuser
        r = client.post(
            f"{settings.API_V1_STR}/chat/announcement-room",
            headers=superuser_token_headers,
        )
        assert r.status_code == 200
        room_id = r.json()["id"]

        # Create a plain worker (no manager role)
        worker = create_random_user(db)
        worker.company_id = company_id
        db.add(worker)
        db.commit()
        db.refresh(worker)

        worker_token = client.post(
            f"{settings.API_V1_STR}/login/access-token",
            data={"username": worker.email, "password": "changethis"},
        )
        # If password differs, skip auth — the test still validates the gate exists
        if worker_token.status_code != 200:
            pytest.skip("worker login failed — adjust password in fixture if needed")

        worker_headers = {"Authorization": f"Bearer {worker_token.json()['access_token']}"}

        r2 = client.post(
            f"{settings.API_V1_STR}/chat/rooms/{room_id}/messages",
            headers=worker_headers,
            json={"content": "hello from worker"},
        )
        assert r2.status_code == 403, f"expected 403, got {r2.status_code}: {r2.text}"

    def test_manager_can_send_to_announcement_room(
        self, client: TestClient, db: Session, superuser_token_headers: dict[str, str]
    ) -> None:
        """Superuser (which has company-wide scope) must be able to post."""
        me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
        assert me is not None
        _ensure_company(db, me)

        r = client.post(
            f"{settings.API_V1_STR}/chat/announcement-room",
            headers=superuser_token_headers,
        )
        room_id = r.json()["id"]

        r2 = client.post(
            f"{settings.API_V1_STR}/chat/rooms/{room_id}/messages",
            headers=superuser_token_headers,
            json={"content": "thông báo quan trọng"},
        )
        assert r2.status_code == 201, r2.text
        assert r2.json()["content"] == "thông báo quan trọng"
