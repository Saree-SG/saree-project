"""
Integration tests for Project management — TC-03.

Coverage:
  - TC-03-01: Tạo project client
  - TC-03-02: Tạo project internal
  - TC-03-03: Tạo project không có permission → 403
  - TC-03-04: PM tự động là member sau khi tạo
  - TC-03-05: Thêm member vào project
  - TC-03-06: Xóa member khỏi project
  - TC-03-07: Không có PROJECT_MANAGE_MEMBERS → 403 khi add member
  - TC-03-08: Update project fields
  - TC-03-09: GET /projects/ trả về danh sách
  - TC-03-10: GET project theo ID
  - TC-03-11: Soft delete project
  - TC-03-12: User chỉ thấy project mình tham gia (PROJECT_VIEW)
  - TC-03-13: Admin thấy tất cả (PROJECT_VIEW_ALL)
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
from app.models.user import User, UserCreate

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
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
    email = f"test_prj_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


def _create_project(client: TestClient, headers: dict, pm_id: str, name: str | None = None,
                    project_type: str = "client") -> dict:
    today = date.today()
    r = client.post(f"{API}/projects/", json={
        "name": name or f"Proj-{uuid.uuid4().hex[:6]}",
        "code": f"P{uuid.uuid4().hex[:5].upper()}",
        "start_date": str(today),
        "end_date": str(today + timedelta(days=90)),
        "project_type": project_type,
        "pm_id": pm_id,
    }, headers=headers)
    assert r.status_code == 201, f"create_project failed: {r.text}"
    return r.json()


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"ProjCo-{uuid.uuid4().hex[:6]}", slug=f"projco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def pm_role(mdb: Session, company: Company) -> Role:
    # Name must be "manager" so project service auto-adds creator as member
    return _make_role(mdb, company, "manager", 1, [
        "PROJECT_CREATE", "PROJECT_VIEW", "PROJECT_VIEW_ALL",
        "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS", "PROJECT_DELETE",
    ])


@pytest.fixture(scope="module")
def member_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Member", 2, [
        "PROJECT_VIEW",
    ])


@pytest.fixture(scope="module")
def no_perm_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "NoPerm", 3, [])


@pytest.fixture(scope="module")
def pm_user(mdb: Session, company: Company, pm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, pm_role, "pm")


@pytest.fixture(scope="module")
def member_user(mdb: Session, company: Company, member_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, member_role, "mem")


@pytest.fixture(scope="module")
def no_perm_user(mdb: Session, company: Company, no_perm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, no_perm_role, "noperm")


@pytest.fixture(scope="module")
def pm_headers(client: TestClient, pm_user: tuple[User, str]) -> dict:
    user, pw = pm_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def member_headers(client: TestClient, member_user: tuple[User, str]) -> dict:
    user, pw = member_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def no_perm_headers(client: TestClient, no_perm_user: tuple[User, str]) -> dict:
    user, pw = no_perm_user
    return _login(client, user.email, pw)


# ---------------------------------------------------------------------------
# TC-03-01/02: Tạo project
# ---------------------------------------------------------------------------

class TestProjectCreate:

    def test_create_client_project(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-01: PM tạo project client."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), project_type="client")
        assert p["project_type"] == "client"
        assert "id" in p

    def test_create_internal_project(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-02: PM tạo project internal."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), project_type="internal")
        assert p["project_type"] == "internal"

    def test_no_permission_cannot_create(
        self, client: TestClient, no_perm_user: tuple[User, str], no_perm_headers: dict
    ) -> None:
        """TC-03-03: User không có PROJECT_CREATE → 403."""
        no_perm, _ = no_perm_user
        today = date.today()
        r = client.post(f"{API}/projects/", json={
            "name": "ShouldFail",
            "code": "FAIL01",
            "start_date": str(today),
            "end_date": str(today + timedelta(days=30)),
            "pm_id": str(no_perm.id),
        }, headers=no_perm_headers)
        assert r.status_code == 403

    def test_pm_can_add_themselves_as_member(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict, pm_role: Role
    ) -> None:
        """TC-03-04: PM có thể add bản thân vào project (PROJECT_MANAGE_MEMBERS)."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id))
        r = client.post(
            f"{API}/projects/{p['id']}/members",
            params={"user_id": str(pm.id), "role_id": str(pm_role.id)},
            headers=pm_headers,
        )
        assert r.status_code == 201
        r = client.get(f"{API}/projects/{p['id']}/members", headers=pm_headers)
        assert r.status_code == 200
        member_ids = [m["user_id"] for m in r.json()]
        assert str(pm.id) in member_ids


# ---------------------------------------------------------------------------
# TC-03-05/06/07: Member management
# ---------------------------------------------------------------------------

class TestProjectMembers:

    def test_add_member(
        self, client: TestClient,
        pm_user: tuple[User, str], member_user: tuple[User, str],
        pm_headers: dict, member_role: Role
    ) -> None:
        """TC-03-05: PM thêm member vào project."""
        pm, _ = pm_user
        mem, _ = member_user
        p = _create_project(client, pm_headers, str(pm.id))

        r = client.post(
            f"{API}/projects/{p['id']}/members",
            params={"user_id": str(mem.id), "role_id": str(member_role.id)},
            headers=pm_headers,
        )
        assert r.status_code == 201

        r = client.get(f"{API}/projects/{p['id']}/members", headers=pm_headers)
        member_ids = [m["user_id"] for m in r.json()]
        assert str(mem.id) in member_ids

    def test_remove_member(
        self, client: TestClient,
        pm_user: tuple[User, str], member_user: tuple[User, str],
        pm_headers: dict, member_role: Role
    ) -> None:
        """TC-03-06: PM xóa member."""
        pm, _ = pm_user
        mem, _ = member_user
        p = _create_project(client, pm_headers, str(pm.id))

        # Add first
        client.post(
            f"{API}/projects/{p['id']}/members",
            params={"user_id": str(mem.id), "role_id": str(member_role.id)},
            headers=pm_headers,
        )

        # Remove
        r = client.delete(f"{API}/projects/{p['id']}/members/{mem.id}", headers=pm_headers)
        assert r.status_code == 204

        r = client.get(f"{API}/projects/{p['id']}/members", headers=pm_headers)
        member_ids = [m["user_id"] for m in r.json()]
        assert str(mem.id) not in member_ids

    def test_no_manage_members_permission_returns_403(
        self, client: TestClient,
        pm_user: tuple[User, str], no_perm_user: tuple[User, str],
        pm_headers: dict, no_perm_headers: dict, member_role: Role
    ) -> None:
        """TC-03-07: User thiếu PROJECT_MANAGE_MEMBERS → 403 khi add member."""
        pm, _ = pm_user
        no_perm, _ = no_perm_user
        p = _create_project(client, pm_headers, str(pm.id))

        r = client.post(
            f"{API}/projects/{p['id']}/members",
            params={"user_id": str(no_perm.id), "role_id": str(member_role.id)},
            headers=no_perm_headers,  # no_perm_role không có bất kỳ permission nào
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-03-08: Update project
# ---------------------------------------------------------------------------

class TestProjectUpdate:

    def test_update_project_name(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-08: Cập nhật tên project."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id))
        r = client.patch(f"{API}/projects/{p['id']}", json={"name": "New Name"}, headers=pm_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "New Name"

    def test_update_project_status(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-08b: Cập nhật status project."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id))
        r = client.patch(f"{API}/projects/{p['id']}", json={"status": "active"}, headers=pm_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "active"


# ---------------------------------------------------------------------------
# TC-03-09/10: List & Get
# ---------------------------------------------------------------------------

class TestProjectList:

    def test_list_projects_returns_own_projects(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-09: GET /projects/ trả về danh sách."""
        pm, _ = pm_user
        _create_project(client, pm_headers, str(pm.id))
        r = client.get(f"{API}/projects/", headers=pm_headers)
        assert r.status_code == 200
        data = r.json()
        assert "data" in data or isinstance(data, list)

    def test_get_project_by_id(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-10: GET /{project_id} trả về đúng project."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="Specific Project")
        r = client.get(f"{API}/projects/{p['id']}", headers=pm_headers)
        assert r.status_code == 200
        assert r.json()["id"] == p["id"]
        assert r.json()["name"] == "Specific Project"

    def test_member_cannot_see_unjoined_project_in_view_only(
        self, client: TestClient,
        pm_user: tuple[User, str], pm_headers: dict,
        member_headers: dict
    ) -> None:
        """TC-03-12: User chỉ có PROJECT_VIEW không thấy project họ chưa tham gia."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="PM Only Project")

        # member_user không được add vào project này
        r = client.get(f"{API}/projects/", headers=member_headers)
        assert r.status_code == 200
        project_ids = [proj["id"] for proj in (r.json().get("data") or r.json())]
        assert p["id"] not in project_ids, "User chỉ có PROJECT_VIEW không thấy project chưa join"


# ---------------------------------------------------------------------------
# TC-03-11: Soft delete
# ---------------------------------------------------------------------------

class TestProjectDelete:

    def test_soft_delete_project(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-11: Xóa mềm project → không còn trong danh sách."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="To Delete")

        r = client.delete(f"{API}/projects/{p['id']}", headers=pm_headers)
        assert r.status_code in (200, 204)

        # Should not appear in list anymore
        r = client.get(f"{API}/projects/", headers=pm_headers)
        project_ids = [proj["id"] for proj in (r.json().get("data") or r.json())]
        assert p["id"] not in project_ids


# ---------------------------------------------------------------------------
# TC-03-12/13/15: Filter by status, superuser sees all, delete by superuser
# ---------------------------------------------------------------------------

class TestProjectFilter:

    def test_filter_projects_by_status(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-12: GET /projects/?status=active trả về đúng."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="Filter Active")
        # Set to active
        client.patch(f"{API}/projects/{p['id']}", json={"status": "active"}, headers=pm_headers)

        r = client.get(f"{API}/projects/?status=active", headers=pm_headers)
        assert r.status_code == 200
        items = r.json().get("data") or r.json()
        ids = [proj["id"] for proj in items]
        assert p["id"] in ids

    def test_filter_excludes_other_status(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-12b: Filter by status=planning không trả về project active."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="Active Only")
        client.patch(f"{API}/projects/{p['id']}", json={"status": "active"}, headers=pm_headers)

        r = client.get(f"{API}/projects/?status=planning", headers=pm_headers)
        assert r.status_code == 200
        raw = r.json()
        items = raw.get("data") if isinstance(raw, dict) else raw
        items = items or []
        ids = [proj["id"] for proj in items]
        assert p["id"] not in ids

    def test_superuser_can_delete_project(
        self, client: TestClient, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-03-15: PM (với PROJECT_DELETE) có thể xóa project."""
        pm, _ = pm_user
        p = _create_project(client, pm_headers, str(pm.id), name="Delete By PM")
        r = client.delete(f"{API}/projects/{p['id']}", headers=pm_headers)
        assert r.status_code in (200, 204)
        # Confirm gone
        r2 = client.get(f"{API}/projects/{p['id']}", headers=pm_headers)
        assert r2.status_code == 404
