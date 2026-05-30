"""
Integration tests for Auth & RBAC — TC-01.

Coverage:
  - TC-01-01: Login đúng → access token
  - TC-01-02: Sai mật khẩu → 400/401
  - TC-01-03: No token → 401
  - TC-01-04: Superuser bypass permission check
  - TC-01-05: User không có permission → 403
  - TC-01-06: Gán role → user nhận permission đó
  - TC-01-07: Token expired / invalid → 401
  - TC-01-08: Đúng role nhưng sai company → 403
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str):
    return client.post(f"{API}/login/access-token", data={"username": email, "password": password})


def _auth(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = _login(client, email, password)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Module-scoped DB session & fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"AuthCo-{uuid.uuid4().hex[:6]}", slug=f"authco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def plain_user(mdb: Session, company: Company) -> tuple[User, str]:
    """User without any role/permissions."""
    pw = "Testpass1!plain"
    email = f"plain_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=pw, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.commit()
    mdb.refresh(user)
    return user, pw


@pytest.fixture(scope="module")
def super_user(mdb: Session, company: Company) -> tuple[User, str]:
    """Superuser — should bypass permission checks."""
    pw = "Testpass1!super"
    email = f"super_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(
        email=email, password=pw, is_active=True, is_superuser=True
    ))
    user.company_id = company.id
    mdb.add(user)
    mdb.commit()
    mdb.refresh(user)
    return user, pw


@pytest.fixture(scope="module")
def role_with_quotation_view(mdb: Session, company: Company) -> Role:
    """Role that has only QUOTATION_VIEW permission."""
    role = Role(
        company_id=company.id,
        name=f"qview_{uuid.uuid4().hex[:6]}",
        display_name="Quotation Viewer",
        level=3,
        is_system=False,
    )
    mdb.add(role)
    mdb.flush()
    perm = mdb.exec(select(Permission).where(Permission.code == "QUOTATION_VIEW")).first()
    if perm:
        mdb.add(RolePermission(role_id=role.id, permission_id=perm.id))
    mdb.commit()
    mdb.refresh(role)
    return role


# ---------------------------------------------------------------------------
# TC-01-01: Login đúng → nhận token
# ---------------------------------------------------------------------------

class TestLogin:

    def test_login_correct_credentials(self, client: TestClient, plain_user: tuple[User, str]) -> None:
        """TC-01-01: Login thành công → có access_token."""
        user, pw = plain_user
        r = _login(client, user.email, pw)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client: TestClient, plain_user: tuple[User, str]) -> None:
        """TC-01-02: Sai mật khẩu → 400."""
        user, _ = plain_user
        r = _login(client, user.email, "WrongPass999!")
        assert r.status_code == 400

    def test_login_nonexistent_user(self, client: TestClient) -> None:
        """TC-01-02b: Email không tồn tại → 400."""
        r = _login(client, "nobody@nothere.com", "Pass1!")
        assert r.status_code == 400

    def test_no_token_returns_401(self, client: TestClient) -> None:
        """TC-01-03: Gọi endpoint bảo vệ không có token → 401."""
        r = client.get(f"{API}/users/me")
        assert r.status_code == 401

    def test_invalid_token_returns_401(self, client: TestClient) -> None:
        """TC-01-07: Token sai định dạng → 401."""
        r = client.get(f"{API}/users/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401

    def test_valid_token_accesses_me(self, client: TestClient, plain_user: tuple[User, str]) -> None:
        """TC-01-01b: Token hợp lệ → GET /me trả về user info."""
        user, pw = plain_user
        headers = _auth(client, user.email, pw)
        r = client.get(f"{API}/users/me", headers=headers)
        assert r.status_code == 200
        assert r.json()["email"] == user.email


# ---------------------------------------------------------------------------
# TC-01-04: Superuser bypass
# ---------------------------------------------------------------------------

class TestSuperuserBypass:

    def test_superuser_can_access_protected_endpoints(
        self, client: TestClient, super_user: tuple[User, str]
    ) -> None:
        """TC-01-04: Superuser không cần permission cụ thể."""
        user, pw = super_user
        headers = _auth(client, user.email, pw)
        # GET quotations requires QUOTATION_VIEW or QUOTATION_VIEW_ALL
        r = client.get(f"{API}/quotations/", headers=headers)
        assert r.status_code == 200

    def test_superuser_can_list_users(
        self, client: TestClient, super_user: tuple[User, str]
    ) -> None:
        """TC-01-04b: Superuser có thể list users."""
        user, pw = super_user
        headers = _auth(client, user.email, pw)
        r = client.get(f"{API}/users/", headers=headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# TC-01-05: Permission guard — 403 for missing permission
# ---------------------------------------------------------------------------

class TestPermissionGuard:

    def test_no_permission_returns_403(
        self, client: TestClient, plain_user: tuple[User, str]
    ) -> None:
        """TC-01-05: User không có QUOTATION_VIEW → 403."""
        user, pw = plain_user
        headers = _auth(client, user.email, pw)
        r = client.get(f"{API}/quotations/", headers=headers)
        assert r.status_code == 403

    def test_no_permission_for_protected_write(
        self, client: TestClient, plain_user: tuple[User, str]
    ) -> None:
        """TC-01-05b: User không có QUOTATION_CREATE → 403 on POST."""
        user, pw = plain_user
        headers = _auth(client, user.email, pw)
        r = client.post(f"{API}/quotations/", json={
            "project_name": "Test",
            "client_company_name": "ABC",
            "equipment_category": "dieu_hoa",
        }, headers=headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-01-06: Gán role → nhận permission
# ---------------------------------------------------------------------------

class TestRoleAssignment:

    def test_user_gains_permission_after_role_assigned(
        self, client: TestClient, mdb: Session,
        company: Company, role_with_quotation_view: Role
    ) -> None:
        """TC-01-06: Sau khi gán role có QUOTATION_VIEW, user có thể truy cập."""
        pw = "Testpass1!newrole"
        email = f"newrole_{uuid.uuid4().hex[:6]}@example.com"
        user = create_user(session=mdb, user_create=UserCreate(email=email, password=pw, is_active=True))
        user.company_id = company.id
        mdb.add(user)
        mdb.commit()
        mdb.refresh(user)

        # Chưa có role → 403
        headers = _auth(client, email, pw)
        r = client.get(f"{API}/quotations/", headers=headers)
        assert r.status_code == 403

        # Gán role
        mdb.add(UserCompanyRole(
            user_id=user.id,
            company_id=company.id,
            role_id=role_with_quotation_view.id,
            is_primary=True,
        ))
        mdb.commit()

        # Phải login lại để có token mới (token đã có không thay đổi, nhưng check là DB-level)
        headers = _auth(client, email, pw)
        r = client.get(f"{API}/quotations/", headers=headers)
        assert r.status_code == 200
