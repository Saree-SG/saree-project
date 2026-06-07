"""
Integration tests for the customer-company directory + quotation linking.

Coverage:
  - CRUD: create / list (type + search filter) / get / update (info + location) / soft-delete
  - Permission: user without QUOTATION_CREATE cannot create (403)
  - Tenant isolation: a user in another company cannot see/edit the rows
  - Quotation link: creating a quotation with client_company_id snapshots the
    customer's contact fields; creating with a free-text name auto-creates and
    links a customer company.
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
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(
        f"{API}/login/access-token", data={"username": email, "password": password}
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_role(
    mdb: Session, company: Company, display: str, level: int, perm_codes: list[str]
) -> Role:
    role = Role(
        company_id=company.id,
        name=f"{display.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
        display_name=display,
        level=level,
        is_system=False,
    )
    mdb.add(role)
    mdb.flush()
    perms = mdb.exec(
        select(Permission).where(Permission.code.in_(perm_codes))  # type: ignore[arg-type]
    ).all()
    for p in perms:
        mdb.add(RolePermission(role_id=role.id, permission_id=p.id))
    mdb.commit()
    mdb.refresh(role)
    return role


def _make_user(
    mdb: Session, company: Company, role: Role, suffix: str
) -> tuple[User, str]:
    password = f"Testpass1!{suffix}"
    email = f"test_cc_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(
        session=mdb, user_create=UserCreate(email=email, password=password, is_active=True)
    )
    user.company_id = company.id
    mdb.add(user)
    mdb.add(
        UserCompanyRole(
            user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True
        )
    )
    mdb.commit()
    mdb.refresh(user)
    return user, password


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"CcCo-{uuid.uuid4().hex[:6]}", slug=f"ccco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def sales_headers(client: TestClient, mdb: Session, company: Company) -> dict:
    role = _make_role(
        mdb, company, "Sales", 2, ["QUOTATION_CREATE", "QUOTATION_VIEW", "QUOTATION_VIEW_ALL"]
    )
    user, pw = _make_user(mdb, company, role, "sales")
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def viewer_headers(client: TestClient, mdb: Session, company: Company) -> dict:
    role = _make_role(mdb, company, "Viewer", 3, ["QUOTATION_VIEW"])
    user, pw = _make_user(mdb, company, role, "viewer")
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def other_company_headers(client: TestClient, mdb: Session) -> dict:
    c = Company(
        name=f"OtherCo-{uuid.uuid4().hex[:6]}", slug=f"otherco-{uuid.uuid4().hex[:6]}"
    )
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    role = _make_role(mdb, c, "Sales", 2, ["QUOTATION_CREATE", "QUOTATION_VIEW"])
    user, pw = _make_user(mdb, c, role, "other")
    return _login(client, user.email, pw)


def _create_customer(client: TestClient, headers: dict, **overrides) -> dict:
    body = {
        "name": overrides.pop("name", f"Khách {uuid.uuid4().hex[:6]}"),
        "type": "customer",
        "contact_name": "Nguyen Van A",
        "contact_phone": "0900000000",
        "address": "123 Đường ABC",
        **overrides,
    }
    r = client.post(f"{API}/customer-companies", json=body, headers=headers)
    assert r.status_code == 201, f"create failed: {r.text}"
    return r.json()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

class TestCustomerCompanyCrud:
    def test_create_and_get(self, client: TestClient, sales_headers: dict) -> None:
        created = _create_customer(client, sales_headers, name="Công ty TNHH XYZ")
        assert created["name"] == "Công ty TNHH XYZ"
        assert created["type"] == "customer"
        assert created["is_active"] is True

        r = client.get(f"{API}/customer-companies/{created['id']}", headers=sales_headers)
        assert r.status_code == 200
        assert r.json()["contact_name"] == "Nguyen Van A"

    def test_list_and_filters(self, client: TestClient, sales_headers: dict) -> None:
        unique = uuid.uuid4().hex[:8]
        _create_customer(client, sales_headers, name=f"Cust-{unique}", type="customer")
        _create_customer(client, sales_headers, name=f"Own-{unique}", type="own")

        # search by name
        r = client.get(
            f"{API}/customer-companies", params={"q": unique}, headers=sales_headers
        )
        assert r.status_code == 200
        names = {row["name"] for row in r.json()["data"]}
        assert {f"Cust-{unique}", f"Own-{unique}"} <= names

        # filter by type
        r = client.get(
            f"{API}/customer-companies",
            params={"type": "own", "q": unique},
            headers=sales_headers,
        )
        rows = r.json()["data"]
        assert all(row["type"] == "own" for row in rows)
        assert any(row["name"] == f"Own-{unique}" for row in rows)

    def test_update_info_and_location(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        created = _create_customer(client, sales_headers)
        r = client.patch(
            f"{API}/customer-companies/{created['id']}",
            json={
                "contact_name": "Tran Thi B",
                "site_lat": 10.762622,
                "site_lng": 106.660172,
                "site_radius_m": 200,
            },
            headers=sales_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["contact_name"] == "Tran Thi B"
        assert data["site_lat"] == 10.762622
        assert data["site_radius_m"] == 200

    def test_soft_delete(self, client: TestClient, sales_headers: dict) -> None:
        created = _create_customer(client, sales_headers, name="ToDelete")
        r = client.delete(
            f"{API}/customer-companies/{created['id']}", headers=sales_headers
        )
        assert r.status_code == 204

        # gone from get and list
        r = client.get(
            f"{API}/customer-companies/{created['id']}", headers=sales_headers
        )
        assert r.status_code == 404
        r = client.get(
            f"{API}/customer-companies", params={"q": "ToDelete"}, headers=sales_headers
        )
        assert all(row["id"] != created["id"] for row in r.json()["data"])

    def test_invalid_type_rejected(self, client: TestClient, sales_headers: dict) -> None:
        r = client.post(
            f"{API}/customer-companies",
            json={"name": "Bad", "type": "supplier"},
            headers=sales_headers,
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Permissions & tenant isolation
# ---------------------------------------------------------------------------

class TestCustomerCompanyAccess:
    def test_viewer_cannot_create(self, client: TestClient, viewer_headers: dict) -> None:
        r = client.post(
            f"{API}/customer-companies", json={"name": "Nope"}, headers=viewer_headers
        )
        assert r.status_code == 403

    def test_viewer_without_customer_view_cannot_list(
        self, client: TestClient, sales_headers: dict, viewer_headers: dict
    ) -> None:
        # A plain L3 role (no CUSTOMER_VIEW) must not see the customer directory.
        _create_customer(client, sales_headers, name="HiddenFromViewer")
        r = client.get(f"{API}/customer-companies", headers=viewer_headers)
        assert r.status_code == 403

    def test_tenant_isolation(
        self, client: TestClient, sales_headers: dict, other_company_headers: dict
    ) -> None:
        created = _create_customer(client, sales_headers, name="TenantScoped")
        # other tenant cannot fetch or update it
        r = client.get(
            f"{API}/customer-companies/{created['id']}", headers=other_company_headers
        )
        assert r.status_code == 404
        r = client.patch(
            f"{API}/customer-companies/{created['id']}",
            json={"name": "Hacked"},
            headers=other_company_headers,
        )
        assert r.status_code == 404
        # and it is absent from their list
        r = client.get(f"{API}/customer-companies", headers=other_company_headers)
        assert all(row["id"] != created["id"] for row in r.json()["data"])


# ---------------------------------------------------------------------------
# Quotation linking
# ---------------------------------------------------------------------------

class TestQuotationLink:
    def test_create_quotation_with_client_company_id_snapshots(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        cust = _create_customer(
            client,
            sales_headers,
            name="Linked Customer Co",
            contact_name="Le Van C",
            contact_phone="0911111111",
            address="456 Linked St",
        )
        r = client.post(
            f"{API}/quotations/",
            json={
                "project_name": f"Proj-{uuid.uuid4().hex[:6]}",
                "client_company_id": cust["id"],
                # intentionally leave client_company_name blank to prove snapshot fills it
                "client_company_name": "",
            },
            headers=sales_headers,
        )
        assert r.status_code == 201, r.text
        q = r.json()
        assert q["client_company_id"] == cust["id"]
        assert q["client_company_name"] == "Linked Customer Co"
        assert q["client_contact_name"] == "Le Van C"
        assert q["client_address"] == "456 Linked St"

    def test_create_quotation_with_name_auto_creates_customer(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        unique_name = f"AutoCreated {uuid.uuid4().hex[:8]}"
        r = client.post(
            f"{API}/quotations/",
            json={
                "project_name": f"Proj-{uuid.uuid4().hex[:6]}",
                "client_company_name": unique_name,
            },
            headers=sales_headers,
        )
        assert r.status_code == 201, r.text
        q = r.json()
        assert q["client_company_id"] is not None

        # the auto-created customer appears in the directory
        r = client.get(
            f"{API}/customer-companies",
            params={"q": unique_name},
            headers=sales_headers,
        )
        rows = r.json()["data"]
        assert any(row["id"] == q["client_company_id"] for row in rows)

    def test_auto_create_dedupes_by_name(
        self, client: TestClient, sales_headers: dict
    ) -> None:
        name = f"Dedupe Co {uuid.uuid4().hex[:8]}"
        r1 = client.post(
            f"{API}/quotations/",
            json={"project_name": "P1", "client_company_name": name},
            headers=sales_headers,
        )
        r2 = client.post(
            f"{API}/quotations/",
            json={"project_name": "P2", "client_company_name": name.lower()},
            headers=sales_headers,
        )
        assert r1.status_code == 201 and r2.status_code == 201
        # same customer reused despite different casing
        assert r1.json()["client_company_id"] == r2.json()["client_company_id"]
