"""
Integration tests for Company/Role/Department management (`/roles/*`) — TC-10.

Coverage:
  - TC-10-01: Director tạo vai trò mới kèm gán quyền.
  - TC-10-02: Director tạo phòng ban.
  - TC-10-03: Đổi vai trò của thành viên công ty.
  - TC-10-04: Director xem danh sách thành viên công ty.
  - TC-10-05/06/07/08: Cross-company isolation cho catalog vai trò, role
    dependencies, phòng ban và role assignments của user khác — phát hiện và
    vá lỗ hổng: các endpoint này trước đây không kiểm tra người gọi có thuộc
    company_id được truyền vào hay không.
  - TC-10-09: User thường (không phải director) không quản lý được công ty.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.core.config import settings
from app.crud import create_user
from app.models.org import Company, Permission, Role, RolePermission, UserCompanyRole
from app.models.user import User, UserCreate

API = settings.API_V1_STR


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_role(mdb: Session, company: Company, name: str, display: str, level: int,
                perm_codes: list[str]) -> Role:
    role = Role(
        company_id=company.id,
        name=name,
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
    email = f"test_rc_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"RoleCo-{uuid.uuid4().hex[:6]}", slug=f"roleco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def other_company(mdb: Session) -> Company:
    c = Company(name=f"RoleOther-{uuid.uuid4().hex[:6]}", slug=f"roleother-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def director_role(mdb: Session, company: Company) -> Role:
    # level == 1 grants the company-director scope used by _has_director_role.
    return _make_role(mdb, company, "director", "Giám đốc", 1, [])


@pytest.fixture(scope="module")
def worker_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, f"worker_{uuid.uuid4().hex[:6]}", "Nhân viên", 3, [])


@pytest.fixture(scope="module")
def director_user(mdb: Session, company: Company, director_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, director_role, "dir")


@pytest.fixture(scope="module")
def worker_user(mdb: Session, company: Company, worker_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, worker_role, "worker")


@pytest.fixture(scope="module")
def director_headers(client: TestClient, director_user: tuple[User, str]) -> dict:
    user, pw = director_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def worker_headers(client: TestClient, worker_user: tuple[User, str]) -> dict:
    user, pw = worker_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def other_director_role(mdb: Session, other_company: Company) -> Role:
    return _make_role(mdb, other_company, "director", "Giám đốc", 1, [])


@pytest.fixture(scope="module")
def other_director_user(mdb: Session, other_company: Company, other_director_role: Role) -> tuple[User, str]:
    return _make_user(mdb, other_company, other_director_role, "otherdir")


@pytest.fixture(scope="module")
def other_director_headers(client: TestClient, other_director_user: tuple[User, str]) -> dict:
    user, pw = other_director_user
    return _login(client, user.email, pw)


# ---------------------------------------------------------------------------
# TC-10-01/02: Director creates role & department
# ---------------------------------------------------------------------------

class TestRoleAndDepartmentCreate:

    def test_director_creates_role_with_permissions(
        self, client: TestClient, company: Company, director_headers: dict
    ) -> None:
        r = client.get(f"{API}/roles/permissions-catalog", headers=director_headers)
        assert r.status_code == 200
        perm_codes = [p["code"] for p in r.json()][:2]
        assert perm_codes, "Seed must provide at least 2 permissions"

        r = client.post(
            f"{API}/roles/create",
            params={"company_id": str(company.id)},
            json={
                "name": f"qa_{uuid.uuid4().hex[:6]}",
                "display_name": "QA Lead",
                "level": 2,
                "description": "Quality assurance lead",
            },
            headers=director_headers,
        )
        assert r.status_code == 201, r.text
        role_id = r.json()["id"]

        r = client.post(f"{API}/roles/{role_id}/permissions",
                         json={"permission_codes": perm_codes}, headers=director_headers)
        assert r.status_code == 200, r.text

        r = client.get(f"{API}/roles/{role_id}/permissions", headers=director_headers)
        assert r.status_code == 200
        assert set(perm_codes).issubset(set(r.json()))

    def test_director_creates_department(
        self, client: TestClient, company: Company, director_headers: dict
    ) -> None:
        r = client.post(f"{API}/roles/companies/{company.id}/departments", json={
            "name": f"Phòng thử nghiệm {uuid.uuid4().hex[:4]}",
            "dept_type": "office",
        }, headers=director_headers)
        assert r.status_code == 201, r.text
        assert r.json()["company_id"] == str(company.id)


# ---------------------------------------------------------------------------
# TC-10-03/04: Member management
# ---------------------------------------------------------------------------

class TestCompanyMembers:

    def test_director_lists_company_members(
        self, client: TestClient, company: Company, director_headers: dict,
        worker_user: tuple[User, str],
    ) -> None:
        r = client.get(f"{API}/roles/companies/{company.id}/members", headers=director_headers)
        assert r.status_code == 200
        worker, _ = worker_user
        member_ids = [m["user_id"] for m in r.json()]
        assert str(worker.id) in member_ids

    def test_director_changes_member_role(
        self, client: TestClient, company: Company, director_headers: dict,
        worker_user: tuple[User, str], worker_role: Role,
    ) -> None:
        worker, _ = worker_user
        r = client.patch(
            f"{API}/roles/companies/{company.id}/members/{worker.id}",
            json={
                "current_role_id": str(worker_role.id),
                "new_role_id": str(worker_role.id),
                "is_primary": True,
            },
            headers=director_headers,
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# TC-10-05..08: Cross-company isolation (patched gap)
# ---------------------------------------------------------------------------

class TestRoleCompanyCrossCompanyIsolation:

    def test_cannot_list_other_company_role_catalog(
        self, client: TestClient, company: Company, other_director_headers: dict
    ) -> None:
        """TC-10-05: /roles/catalog?company_id=<other> → 403 cho non-superuser
        không thuộc company đó (trước đây trả về danh sách vai trò công ty khác)."""
        r = client.get(f"{API}/roles/catalog", params={"company_id": str(company.id)},
                        headers=other_director_headers)
        assert r.status_code == 403

    def test_cannot_list_other_company_role_dependencies(
        self, client: TestClient, company: Company, other_director_headers: dict
    ) -> None:
        """TC-10-06: GET /roles/?company_id=<other> → 403."""
        r = client.get(f"{API}/roles/", params={"company_id": str(company.id)},
                        headers=other_director_headers)
        assert r.status_code == 403

    def test_cannot_list_other_company_departments(
        self, client: TestClient, company: Company, other_director_headers: dict
    ) -> None:
        """TC-10-07: GET departments của công ty khác → 403."""
        r = client.get(f"{API}/roles/companies/{company.id}/departments",
                        headers=other_director_headers)
        assert r.status_code == 403

    def test_cannot_list_other_company_members(
        self, client: TestClient, company: Company, other_director_headers: dict
    ) -> None:
        r = client.get(f"{API}/roles/companies/{company.id}/members",
                        headers=other_director_headers)
        assert r.status_code == 403

    def test_cannot_view_another_users_company_assignments(
        self, client: TestClient, director_user: tuple[User, str], other_director_headers: dict
    ) -> None:
        """TC-10-08: GET /roles/assignments/{user_id} của người ở công ty khác → 403
        (trước đây không kiểm tra quyền, lộ toàn bộ vai trò/công ty của bất kỳ ai)."""
        director, _ = director_user
        r = client.get(f"{API}/roles/assignments/{director.id}", headers=other_director_headers)
        assert r.status_code == 403

    def test_own_assignments_still_visible(
        self, client: TestClient, director_user: tuple[User, str], director_headers: dict
    ) -> None:
        director, _ = director_user
        r = client.get(f"{API}/roles/assignments/{director.id}", headers=director_headers)
        assert r.status_code == 200
        assert any(a["user_id"] == str(director.id) for a in r.json())


# ---------------------------------------------------------------------------
# TC-10-09: Non-director cannot manage company
# ---------------------------------------------------------------------------

class TestPermissionDenied:

    def test_worker_cannot_create_department(
        self, client: TestClient, company: Company, worker_headers: dict
    ) -> None:
        r = client.post(f"{API}/roles/companies/{company.id}/departments", json={
            "name": "Should fail",
            "dept_type": "office",
        }, headers=worker_headers)
        assert r.status_code == 403

    def test_worker_cannot_change_member_role(
        self, client: TestClient, company: Company, worker_headers: dict,
        director_user: tuple[User, str], worker_role: Role,
    ) -> None:
        director, _ = director_user
        r = client.patch(
            f"{API}/roles/companies/{company.id}/members/{director.id}",
            json={
                "current_role_id": str(worker_role.id),
                "new_role_id": str(worker_role.id),
                "is_primary": False,
            },
            headers=worker_headers,
        )
        assert r.status_code == 403
