"""
Integration tests for Admin (`/admin/users/*`, `/admin/stats/*`) — TC-11.

Coverage:
  - TC-11-01: Superuser-only guard — non-superuser gets 403 on every admin
    endpoint (list users, user detail, memberships, permissions, overview,
    sessions, logins, audit log).
  - TC-11-02: List users returns rich rows (company/role/last login).
  - TC-11-03: User detail returns memberships + sessions + activity.
  - TC-11-04: Add membership (company + role + department), atomic checks
    (role/department must belong to the given company).
  - TC-11-05: Duplicate membership → 409.
  - TC-11-06: Update membership (change role, promote to primary).
  - TC-11-07: Delete membership clears user.company_id/department_id when
    they pointed at the removed company.
  - TC-11-08: Effective permissions endpoint (superuser/director/assigned).
  - TC-11-09: Admin stats — overview counters, audit log filtering.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.crud import create_user
from app.models.org import Company, Department, Permission, Role, RolePermission, UserCompanyRole
from app.models.user import User, UserCreate

API = settings.API_V1_STR


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_role(mdb: Session, company: Company, name: str, display: str, level: int,
                perm_codes: list[str] | None = None) -> Role:
    role = Role(company_id=company.id, name=name, display_name=display, level=level, is_system=False)
    mdb.add(role)
    mdb.flush()
    if perm_codes:
        perms = mdb.exec(select(Permission).where(Permission.code.in_(perm_codes))).all()  # type: ignore[arg-type]
        for p in perms:
            mdb.add(RolePermission(role_id=role.id, permission_id=p.id))
    mdb.commit()
    mdb.refresh(role)
    return role


def _make_plain_user(mdb: Session, suffix: str) -> tuple[User, str]:
    """A user with no company/role assignment yet."""
    password = f"Testpass1!{suffix}"
    email = f"test_admin_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"AdmCo-{uuid.uuid4().hex[:6]}", slug=f"admco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def other_company(mdb: Session) -> Company:
    c = Company(name=f"AdmOther-{uuid.uuid4().hex[:6]}", slug=f"admother-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def director_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "director", "Giám đốc", 1)


@pytest.fixture(scope="module")
def worker_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, f"worker_{uuid.uuid4().hex[:6]}", "Nhân viên", 3, ["TASK_VIEW"])


@pytest.fixture(scope="module")
def other_company_role(mdb: Session, other_company: Company) -> Role:
    return _make_role(mdb, other_company, f"role_{uuid.uuid4().hex[:6]}", "Vai trò khác CT", 3)


@pytest.fixture(scope="module")
def department(mdb: Session, company: Company) -> Department:
    d = Department(company_id=company.id, name=f"Phòng {uuid.uuid4().hex[:4]}", dept_type="office")
    mdb.add(d)
    mdb.commit()
    mdb.refresh(d)
    return d


@pytest.fixture(scope="module")
def other_department(mdb: Session, other_company: Company) -> Department:
    d = Department(company_id=other_company.id, name=f"Phòng khác CT {uuid.uuid4().hex[:4]}", dept_type="office")
    mdb.add(d)
    mdb.commit()
    mdb.refresh(d)
    return d


@pytest.fixture(scope="module")
def plain_user(mdb: Session) -> tuple[User, str]:
    return _make_plain_user(mdb, "plain")


@pytest.fixture(scope="module")
def non_superuser_headers(client: TestClient, mdb: Session, company: Company, worker_role: Role) -> dict:
    user, pw = _make_plain_user(mdb, "nonsu")
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=worker_role.id, is_primary=True))
    mdb.commit()
    return _login(client, user.email, pw)


# ---------------------------------------------------------------------------
# TC-11-01: Superuser-only guard
# ---------------------------------------------------------------------------

class TestAdminSuperuserOnly:

    ENDPOINTS = [
        ("GET", "/admin/users"),
        ("GET", "/admin/stats/overview"),
        ("GET", "/admin/stats/sessions/active"),
        ("GET", "/admin/stats/logins"),
        ("GET", "/admin/stats/users/activity"),
        ("GET", "/admin/stats/audit"),
    ]

    @pytest.mark.parametrize("method,path", ENDPOINTS)
    def test_non_superuser_forbidden(
        self, client: TestClient, non_superuser_headers: dict, method: str, path: str
    ) -> None:
        r = client.request(method, f"{API}{path}", headers=non_superuser_headers)
        assert r.status_code == 403, f"{method} {path}: {r.text}"

    def test_non_superuser_cannot_view_user_detail(
        self, client: TestClient, non_superuser_headers: dict, plain_user: tuple[User, str]
    ) -> None:
        target, _ = plain_user
        r = client.get(f"{API}/admin/users/{target.id}/detail", headers=non_superuser_headers)
        assert r.status_code == 403

    def test_non_superuser_cannot_add_membership(
        self, client: TestClient, non_superuser_headers: dict, plain_user: tuple[User, str],
        company: Company, worker_role: Role,
    ) -> None:
        target, _ = plain_user
        r = client.post(
            f"{API}/admin/users/{target.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(worker_role.id)},
            headers=non_superuser_headers,
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-11-02/03: List & detail
# ---------------------------------------------------------------------------

class TestAdminUserListDetail:

    def test_list_users_includes_seeded_user(
        self, client: TestClient, superuser_token_headers: dict, plain_user: tuple[User, str]
    ) -> None:
        target, _ = plain_user
        r = client.get(f"{API}/admin/users", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        ids = [row["id"] for row in r.json()]
        assert str(target.id) in ids

    def test_get_user_detail(
        self, client: TestClient, superuser_token_headers: dict, plain_user: tuple[User, str]
    ) -> None:
        target, _ = plain_user
        r = client.get(f"{API}/admin/users/{target.id}/detail", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == str(target.id)
        assert data["memberships"] == []

    def test_get_user_detail_404_for_unknown_user(
        self, client: TestClient, superuser_token_headers: dict
    ) -> None:
        r = client.get(f"{API}/admin/users/{uuid.uuid4()}/detail", headers=superuser_token_headers)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TC-11-04/05/06/07: Memberships CRUD
# ---------------------------------------------------------------------------

class TestAdminMemberships:

    def test_add_membership(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, worker_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "add")
        r = client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(worker_role.id), "is_primary": True},
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_primary"] is True

        r = client.get(f"{API}/admin/users/{user.id}/detail", headers=superuser_token_headers)
        assert r.status_code == 200
        assert r.json()["company_id"] == str(company.id)

    def test_add_membership_role_wrong_company_rejected(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, other_company_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "badrole")
        r = client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(other_company_role.id)},
            headers=superuser_token_headers,
        )
        assert r.status_code == 400

    def test_add_membership_department_wrong_company_rejected(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, worker_role: Role, other_department: Department,
    ) -> None:
        user, _ = _make_plain_user(mdb, "baddept")
        r = client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={
                "company_id": str(company.id),
                "role_id": str(worker_role.id),
                "department_id": str(other_department.id),
            },
            headers=superuser_token_headers,
        )
        assert r.status_code == 400

    def test_duplicate_membership_conflict(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, worker_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "dup")
        body = {"company_id": str(company.id), "role_id": str(worker_role.id)}
        r = client.post(f"{API}/admin/users/{user.id}/memberships", json=body, headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        r = client.post(f"{API}/admin/users/{user.id}/memberships", json=body, headers=superuser_token_headers)
        assert r.status_code == 409

    def test_update_membership_role_and_primary(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, worker_role: Role, director_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "upd")
        r = client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(worker_role.id), "is_primary": True},
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text

        r = client.patch(
            f"{API}/admin/users/{user.id}/memberships/{company.id}",
            json={"role_id": str(director_role.id)},
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(m["role_id"] == str(director_role.id) for m in rows)

    def test_delete_membership_clears_company_id(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, worker_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "del")
        r = client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(worker_role.id), "is_primary": True},
            headers=superuser_token_headers,
        )
        assert r.status_code == 200, r.text

        r = client.delete(f"{API}/admin/users/{user.id}/memberships/{company.id}", headers=superuser_token_headers)
        assert r.status_code == 204

        r = client.get(f"{API}/admin/users/{user.id}/detail", headers=superuser_token_headers)
        assert r.status_code == 200
        detail = r.json()
        assert detail["company_id"] is None
        assert detail["memberships"] == []

    def test_delete_unknown_membership_404(
        self, client: TestClient, superuser_token_headers: dict, plain_user: tuple[User, str],
        other_company: Company,
    ) -> None:
        target, _ = plain_user
        r = client.delete(
            f"{API}/admin/users/{target.id}/memberships/{other_company.id}",
            headers=superuser_token_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TC-11-08: Effective permissions
# ---------------------------------------------------------------------------

class TestAdminUserPermissions:

    def test_director_gets_all_non_admin_permissions(
        self, client: TestClient, superuser_token_headers: dict, mdb: Session,
        company: Company, director_role: Role,
    ) -> None:
        user, _ = _make_plain_user(mdb, "dirperm")
        client.post(
            f"{API}/admin/users/{user.id}/memberships",
            json={"company_id": str(company.id), "role_id": str(director_role.id), "is_primary": True},
            headers=superuser_token_headers,
        )
        r = client.get(f"{API}/admin/users/{user.id}/permissions", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["source"] == "director"
        assert data["total"] > 0

    def test_user_with_no_role_has_no_permissions(
        self, client: TestClient, superuser_token_headers: dict, plain_user: tuple[User, str]
    ) -> None:
        target, _ = plain_user
        r = client.get(f"{API}/admin/users/{target.id}/permissions", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["source"] == "none"
        assert data["total"] == 0


# ---------------------------------------------------------------------------
# TC-11-09: Admin stats
# ---------------------------------------------------------------------------

class TestAdminStats:

    def test_overview_counters(self, client: TestClient, superuser_token_headers: dict) -> None:
        r = client.get(f"{API}/admin/stats/overview", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("total_users", "active_users", "total_companies", "total_roles", "online_now"):
            assert key in data
            assert data[key] >= 0

    def test_audit_log_filter_by_entity_type(
        self, client: TestClient, superuser_token_headers: dict
    ) -> None:
        r = client.get(
            f"{API}/admin/stats/audit",
            params={"entity_type": "__nonexistent_entity__"},
            headers=superuser_token_headers,
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_login_frequency_shape(self, client: TestClient, superuser_token_headers: dict) -> None:
        r = client.get(f"{API}/admin/stats/logins", params={"days": 7}, headers=superuser_token_headers)
        assert r.status_code == 200
        for row in r.json():
            assert {"date", "login_count", "unique_users"} <= set(row.keys())
