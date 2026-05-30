"""
Integration tests for Task Profile (Mẫu Công việc) — TC-06.

Coverage:
  - TC-06-04: Tạo mẫu rỗng
  - TC-06-05: Apply mẫu → tạo cây task trong project
  - TC-06-06: Apply với parent_task_id → task gốc là con của task chỉ định
  - TC-06-07: Giữ order_index khi apply
  - TC-06-09: Liệt kê mẫu theo company
  - TC-06-10: Mẫu company khác không hiện trong list
  - TC-06-11: Cập nhật tên/mô tả mẫu
  - TC-06-12: Thêm item vào mẫu
  - TC-06-13: Cập nhật item trong mẫu
  - TC-06-14: Xóa item → cascade xóa con
  - TC-06-15: Xóa mẫu (task đã tạo không bị xóa)
  - TC-06-01: Lưu Hạng mục làm mẫu từ task tầng 0
  - TC-06-02: Mẫu lưu đúng cấu trúc
  - TC-06-03: Chỉ tầng 0 được lưu làm mẫu
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
from app.models.project import Project
from app.models.user import User, UserCreate

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post(f"{API}/login/access-token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_role(mdb: Session, company: Company, display: str, level: int, perm_codes: list[str]) -> Role:
    role = Role(
        company_id=company.id,
        name=f"{display.lower()}_{uuid.uuid4().hex[:6]}",
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
    email = f"test_tp_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


def _create_profile(client: TestClient, headers: dict, company_id: str, name: str = "Test Profile") -> dict:
    r = client.post(f"{API}/task-profiles/", json={
        "name": name,
        "company_id": company_id,
    }, headers=headers)
    assert r.status_code == 201, f"create_profile failed: {r.text}"
    return r.json()


def _add_item(client: TestClient, headers: dict, profile_id: str, name: str,
              parent_item_id: str | None = None, duration_days: int = 5, order_index: int = 0) -> dict:
    r = client.post(f"{API}/task-profiles/{profile_id}/items", json={
        "name": name,
        "parent_item_id": parent_item_id,
        "duration_days": duration_days,
        "order_index": order_index,
    }, headers=headers)
    assert r.status_code == 201, f"add_item failed: {r.text}"
    return r.json()


def _create_project(client: TestClient, headers: dict, pm_id: str, company: Company) -> dict:
    today = date.today()
    r = client.post(f"{API}/projects/", json={
        "name": f"TPProj-{uuid.uuid4().hex[:6]}",
        "code": f"TP{uuid.uuid4().hex[:5].upper()}",
        "start_date": str(today),
        "end_date": str(today + timedelta(days=180)),
        "project_type": "client",
        "pm_id": pm_id,
        "company_id": str(company.id),
    }, headers=headers)
    assert r.status_code == 201, f"create_project failed: {r.text}"
    return r.json()


def _create_task(client: TestClient, headers: dict, project_id: str, assignee_id: str,
                 name: str = "Task", parent_id: str | None = None, days: int = 30) -> dict:
    now = _utcnow()
    body = {
        "name": name,
        "project_id": project_id,
        "assignee_id": assignee_id,
        "start_time": now.isoformat(),
        "end_time": (now + timedelta(days=days)).isoformat(),
    }
    if parent_id:
        r = client.post(f"{API}/tasks/{parent_id}/children", json=body, headers=headers)
    else:
        r = client.post(f"{API}/projects/{project_id}/tasks", json=body, headers=headers)
    assert r.status_code == 201, f"create_task failed: {r.text}"
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
    c = Company(name=f"TPCo-{uuid.uuid4().hex[:6]}", slug=f"tpco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def company2(mdb: Session) -> Company:
    c = Company(name=f"TPCo2-{uuid.uuid4().hex[:6]}", slug=f"tpco2-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def pm_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "PM", 1, [
        "TASK_CREATE", "TASK_VIEW", "TASK_VIEW_ALL", "TASK_UPDATE",
        "TASK_UPDATE_STATUS", "TASK_DELETE",
        "PROJECT_CREATE", "PROJECT_VIEW", "PROJECT_VIEW_ALL",
        "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS",
    ])


@pytest.fixture(scope="module")
def pm_user(mdb: Session, company: Company, pm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, pm_role, "pm")


@pytest.fixture(scope="module")
def pm_headers(client: TestClient, pm_user: tuple[User, str]) -> dict:
    user, pw = pm_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def project(client: TestClient, pm_user: tuple[User, str], pm_headers: dict, company: Company) -> dict:
    pm, _ = pm_user
    return _create_project(client, pm_headers, str(pm.id), company)


# ---------------------------------------------------------------------------
# TC-06-04: Tạo mẫu rỗng
# ---------------------------------------------------------------------------

class TestProfileCreate:

    def test_create_empty_profile(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-04: Tạo mẫu rỗng → items = []."""
        r = client.post(f"{API}/task-profiles/", json={
            "name": "Mẫu rỗng",
            "company_id": str(company.id),
        }, headers=pm_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Mẫu rỗng"
        assert data["items"] == []

    def test_create_profile_with_company(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """Profile thuộc đúng company."""
        p = _create_profile(client, pm_headers, str(company.id), "Profile C1")
        assert p["company_id"] == str(company.id)


# ---------------------------------------------------------------------------
# TC-06-09/10: List theo company
# ---------------------------------------------------------------------------

class TestProfileList:

    def test_list_profiles_by_company(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-09: GET ?company_id=C1 chỉ trả về mẫu của C1."""
        _create_profile(client, pm_headers, str(company.id), "C1 Profile")
        r = client.get(f"{API}/task-profiles/", params={"company_id": str(company.id)}, headers=pm_headers)
        assert r.status_code == 200
        profiles = r.json()
        assert all(p["company_id"] == str(company.id) for p in profiles)

    def test_other_company_profile_not_visible(
        self, client: TestClient, pm_headers: dict, company: Company, company2: Company
    ) -> None:
        """TC-06-10: Mẫu của C2 không xuất hiện khi filter C1."""
        _create_profile(client, pm_headers, str(company2.id), "C2 Profile")
        r = client.get(f"{API}/task-profiles/", params={"company_id": str(company.id)}, headers=pm_headers)
        assert r.status_code == 200
        for p in r.json():
            assert p["company_id"] == str(company.id), "Không được lộ mẫu của công ty khác"


# ---------------------------------------------------------------------------
# TC-06-11/12/13/14/15: CRUD items & profile
# ---------------------------------------------------------------------------

class TestProfileCRUD:

    def test_update_profile_name(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-11: Cập nhật tên mẫu."""
        p = _create_profile(client, pm_headers, str(company.id))
        r = client.patch(f"{API}/task-profiles/{p['id']}", json={"name": "Updated Name"}, headers=pm_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"
        assert r.json()["items"] == []  # Items không bị ảnh hưởng

    def test_add_item_to_profile(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-12: Thêm item vào mẫu."""
        p = _create_profile(client, pm_headers, str(company.id))
        item = _add_item(client, pm_headers, p["id"], "Item A", duration_days=7)
        assert item["name"] == "Item A"
        assert item["duration_days"] == 7
        assert item["profile_id"] == p["id"]

    def test_update_item(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-13: Cập nhật item trong mẫu."""
        p = _create_profile(client, pm_headers, str(company.id))
        item = _add_item(client, pm_headers, p["id"], "Item B", duration_days=5)
        r = client.patch(f"{API}/task-profiles/items/{item['id']}", json={"duration_days": 14}, headers=pm_headers)
        assert r.status_code == 200
        assert r.json()["duration_days"] == 14

    def test_delete_item_cascades_children(
        self, client: TestClient, pm_headers: dict, company: Company
    ) -> None:
        """TC-06-14: Xóa item tầng 1 → xóa cả con."""
        p = _create_profile(client, pm_headers, str(company.id))
        parent_item = _add_item(client, pm_headers, p["id"], "Parent", order_index=0)
        child1 = _add_item(client, pm_headers, p["id"], "Child 1",
                           parent_item_id=parent_item["id"], order_index=0)
        child2 = _add_item(client, pm_headers, p["id"], "Child 2",
                           parent_item_id=parent_item["id"], order_index=1)

        # Xóa parent
        r = client.delete(f"{API}/task-profiles/items/{parent_item['id']}", headers=pm_headers)
        assert r.status_code == 204

        # GET profile → items phải rỗng
        r = client.get(f"{API}/task-profiles/{p['id']}", headers=pm_headers)
        remaining_ids = [i["id"] for i in r.json()["items"]]
        assert parent_item["id"] not in remaining_ids
        assert child1["id"] not in remaining_ids
        assert child2["id"] not in remaining_ids

    def test_delete_profile_keeps_tasks(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str],
        company: Company, project: dict
    ) -> None:
        """TC-06-15: Xóa mẫu → tasks đã apply vẫn còn."""
        pm, _ = pm_user
        p = _create_profile(client, pm_headers, str(company.id), "To Delete Profile")
        root_item = _add_item(client, pm_headers, p["id"], "Root Task", duration_days=10)
        # root_item cần level=0 — được tự động set

        # Apply mẫu vào project
        r = client.post(f"{API}/task-profiles/{p['id']}/apply", json={
            "project_id": project["id"],
            "assignee_id": str(pm.id),
        }, headers=pm_headers)
        assert r.status_code == 201
        created_tasks = r.json()
        assert len(created_tasks) > 0
        task_id = created_tasks[0]["id"]

        # Xóa mẫu
        r = client.delete(f"{API}/task-profiles/{p['id']}", headers=pm_headers)
        assert r.status_code == 204

        # Task vẫn còn
        r = client.get(f"{API}/tasks/{task_id}", headers=pm_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# TC-06-05/06/07: Apply profile
# ---------------------------------------------------------------------------

class TestApplyProfile:

    def test_apply_profile_creates_task_tree(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str],
        company: Company, project: dict
    ) -> None:
        """TC-06-05: Apply mẫu → tạo cây task trong project."""
        pm, _ = pm_user
        p = _create_profile(client, pm_headers, str(company.id), "Tree Profile")

        root = _add_item(client, pm_headers, p["id"], "Root", order_index=0)
        child = _add_item(client, pm_headers, p["id"], "Child", parent_item_id=root["id"], order_index=0)

        r = client.post(f"{API}/task-profiles/{p['id']}/apply", json={
            "project_id": project["id"],
            "assignee_id": str(pm.id),
        }, headers=pm_headers)
        assert r.status_code == 201
        tasks = r.json()
        assert len(tasks) == 2  # root + child
        levels = {t["name"]: t["level"] for t in tasks}
        assert levels["Root"] == 0
        assert levels["Child"] == 1

    def test_apply_profile_with_parent_task_id(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str],
        company: Company, project: dict
    ) -> None:
        """TC-06-06: Apply với parent_task_id → task gốc mẫu là con của task chỉ định."""
        pm, _ = pm_user
        p = _create_profile(client, pm_headers, str(company.id), "Nested Profile")
        _add_item(client, pm_headers, p["id"], "Profile Root", order_index=0)

        # Create a parent task in the project
        parent_task = _create_task(client, pm_headers, project["id"], str(pm.id), name="Parent Task")

        r = client.post(f"{API}/task-profiles/{p['id']}/apply", json={
            "project_id": project["id"],
            "assignee_id": str(pm.id),
            "parent_task_id": parent_task["id"],
        }, headers=pm_headers)
        assert r.status_code == 201
        tasks = r.json()
        assert len(tasks) == 1
        # Root of profile becomes child of parent_task → level = parent.level + 1 = 1
        assert tasks[0]["level"] == 1
        assert tasks[0]["parent_id"] == parent_task["id"]

    def test_apply_preserves_order_index(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str],
        company: Company, project: dict
    ) -> None:
        """TC-06-07: Apply mẫu giữ nguyên order_index."""
        pm, _ = pm_user
        p = _create_profile(client, pm_headers, str(company.id), "Order Profile")
        _add_item(client, pm_headers, p["id"], "First", order_index=1)
        _add_item(client, pm_headers, p["id"], "Second", order_index=2)
        _add_item(client, pm_headers, p["id"], "Third", order_index=3)

        r = client.post(f"{API}/task-profiles/{p['id']}/apply", json={
            "project_id": project["id"],
            "assignee_id": str(pm.id),
        }, headers=pm_headers)
        assert r.status_code == 201
        tasks = r.json()
        names_by_order = sorted(tasks, key=lambda t: t.get("order_index", 0))
        assert [t["name"] for t in names_by_order] == ["First", "Second", "Third"]


# ---------------------------------------------------------------------------
# TC-06-01/02/03: Save task as profile
# ---------------------------------------------------------------------------

class TestSaveTaskAsProfile:

    def test_save_level0_task_as_profile(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str], project: dict
    ) -> None:
        """TC-06-01: Lưu Hạng mục (tầng 0) làm mẫu."""
        pm, _ = pm_user
        t0 = _create_task(client, pm_headers, project["id"], str(pm.id), name="Hạng mục A")

        r = client.post(f"{API}/task-profiles/from-task/{t0['id']}", json={
            "name": "Mẫu Hạng mục A",
        }, headers=pm_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Mẫu Hạng mục A"
        assert len(data["items"]) >= 1  # ít nhất root item

    def test_save_task_preserves_hierarchy(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str], project: dict
    ) -> None:
        """TC-06-02: Mẫu lưu đúng cấu trúc phân cấp."""
        pm, _ = pm_user
        t0 = _create_task(client, pm_headers, project["id"], str(pm.id), name="Root Save")
        t1 = _create_task(client, pm_headers, project["id"], str(pm.id), name="Child Save", parent_id=t0["id"], days=10)

        r = client.post(f"{API}/task-profiles/from-task/{t0['id']}", json={
            "name": "Mẫu hierarchy",
        }, headers=pm_headers)
        assert r.status_code == 201
        items = r.json()["items"]
        assert len(items) == 2
        item_names = {i["name"] for i in items}
        assert "Root Save" in item_names
        assert "Child Save" in item_names

    def test_cannot_save_non_level0_as_profile(
        self, client: TestClient, pm_headers: dict, pm_user: tuple[User, str], project: dict
    ) -> None:
        """TC-06-03: Chỉ tầng 0 được lưu làm mẫu — tầng 1 trở lên → 422."""
        pm, _ = pm_user
        t0 = _create_task(client, pm_headers, project["id"], str(pm.id), name="Parent For Check")
        t1 = _create_task(client, pm_headers, project["id"], str(pm.id), name="Level1 Task", parent_id=t0["id"], days=10)

        r = client.post(f"{API}/task-profiles/from-task/{t1['id']}", json={
            "name": "Should Fail",
        }, headers=pm_headers)
        assert r.status_code == 422, f"Expected 422 for level > 0, got {r.status_code}: {r.text}"
