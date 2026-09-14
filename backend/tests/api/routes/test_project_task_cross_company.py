"""
Integration tests for Project/Task/TaskProfile — cross-company isolation,
task tree + dependency, and template (task profile) apply/save flows.

Coverage:
  - TC-08-01: User công ty khác không xem/sửa/xóa được project công ty này.
  - TC-08-02: User công ty khác không tạo/xem/sửa task trong project công ty này.
  - TC-08-03: User công ty khác không xem được Gantt/level-config/members.
  - TC-08-04: Cây công việc: tạo task con (level 1) dưới task cha (level 0).
  - TC-08-05: Dependency: tạo phụ thuộc FS giữa 2 task cùng project.
  - TC-08-06: Không tạo được dependency giữa 2 task khác project.
  - TC-08-07: Template: lưu Hạng mục làm mẫu, áp dụng mẫu vào project khác
    company → 403; áp dụng vào project cùng company → tạo task tree.
  - TC-08-08: superuser vẫn xem được project/task ở mọi công ty.
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
    assert r.status_code == 200, r.text
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
    email = f"test_ptx_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


def _create_project(client: TestClient, headers: dict, pm_id: str, name: str | None = None) -> dict:
    today = date.today()
    r = client.post(f"{API}/projects/", json={
        "name": name or f"PTX-{uuid.uuid4().hex[:6]}",
        "code": f"PTX{uuid.uuid4().hex[:5].upper()}",
        "start_date": str(today),
        "end_date": str(today + timedelta(days=90)),
        "project_type": "internal",
        "pm_id": pm_id,
    }, headers=headers)
    assert r.status_code == 201, f"create_project failed: {r.text}"
    return r.json()


def _create_root_task(client: TestClient, headers: dict, project_id: str, assignee_id: str,
                       name: str = "Root Task", days: int = 30) -> dict:
    now = _utcnow()
    r = client.post(f"{API}/projects/{project_id}/tasks", json={
        "name": name,
        "project_id": project_id,
        "assignee_id": assignee_id,
        "start_time": now.isoformat(),
        "end_time": (now + timedelta(days=days)).isoformat(),
    }, headers=headers)
    assert r.status_code == 201, f"create_root_task failed: {r.text}"
    return r.json()


def _create_child_task(client: TestClient, headers: dict, parent_id: str, assignee_id: str,
                        name: str = "Child Task", days: int = 10) -> dict:
    now = _utcnow()
    r = client.post(f"{API}/tasks/{parent_id}/children", json={
        "name": name,
        "project_id": str(uuid.uuid4()),  # overridden server-side to parent.project_id
        "assignee_id": assignee_id,
        "start_time": now.isoformat(),
        "end_time": (now + timedelta(days=days)).isoformat(),
    }, headers=headers)
    assert r.status_code == 201, f"create_child_task failed: {r.text}"
    return r.json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"PTXCo-{uuid.uuid4().hex[:6]}", slug=f"ptxco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def other_company(mdb: Session) -> Company:
    c = Company(name=f"PTXOther-{uuid.uuid4().hex[:6]}", slug=f"ptxother-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


PM_PERMS = [
    "PROJECT_CREATE", "PROJECT_VIEW", "PROJECT_VIEW_ALL", "PROJECT_UPDATE",
    "PROJECT_MANAGE_MEMBERS", "PROJECT_DELETE",
    "TASK_CREATE", "TASK_VIEW", "TASK_UPDATE", "TASK_DELETE",
]


@pytest.fixture(scope="module")
def pm_role(mdb: Session, company: Company) -> Role:
    # "manager" name triggers auto-add as project member on create (see project_service)
    return _make_role(mdb, company, "manager", 1, PM_PERMS)


@pytest.fixture(scope="module")
def pm_user(mdb: Session, company: Company, pm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, pm_role, "pm")


@pytest.fixture(scope="module")
def pm_headers(client: TestClient, pm_user: tuple[User, str]) -> dict:
    user, pw = pm_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def other_pm_role(mdb: Session, other_company: Company) -> Role:
    return _make_role(mdb, other_company, "manager", 1, PM_PERMS)


@pytest.fixture(scope="module")
def other_pm_user(mdb: Session, other_company: Company, other_pm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, other_company, other_pm_role, "otherpm")


@pytest.fixture(scope="module")
def other_pm_headers(client: TestClient, other_pm_user: tuple[User, str]) -> dict:
    user, pw = other_pm_user
    return _login(client, user.email, pw)


@pytest.fixture(scope="module")
def project(client: TestClient, pm_user: tuple[User, str], pm_headers: dict) -> dict:
    pm, _ = pm_user
    return _create_project(client, pm_headers, str(pm.id))


@pytest.fixture(scope="module")
def other_project(client: TestClient, other_pm_user: tuple[User, str], other_pm_headers: dict) -> dict:
    pm, _ = other_pm_user
    return _create_project(client, other_pm_headers, str(pm.id))


# ---------------------------------------------------------------------------
# TC-08-01/03: Cross-company project isolation
# ---------------------------------------------------------------------------

class TestProjectCrossCompany:

    def test_cannot_view_other_company_project(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/{project['id']}", headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_update_other_company_project(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.patch(f"{API}/projects/{project['id']}", json={"name": "hack"}, headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_delete_other_company_project(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.delete(f"{API}/projects/{project['id']}", headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_view_other_company_members(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/{project['id']}/members", headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_add_member_to_other_company_project(
        self, client: TestClient, project: dict, other_pm_headers: dict, other_pm_role: Role
    ) -> None:
        r = client.post(
            f"{API}/projects/{project['id']}/members",
            params={"user_id": str(uuid.uuid4()), "role_id": str(other_pm_role.id)},
            headers=other_pm_headers,
        )
        assert r.status_code == 403

    def test_cannot_view_other_company_delay_warnings(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/{project['id']}/delay-warnings", headers=other_pm_headers)
        assert r.status_code == 403

    def test_project_not_leaked_in_other_company_list(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/", headers=other_pm_headers)
        assert r.status_code == 200
        body = r.json()
        items = body["data"] if isinstance(body, dict) and "data" in body else body
        assert all(item["id"] != project["id"] for item in items)


# ---------------------------------------------------------------------------
# TC-08-02/03: Cross-company task isolation
# ---------------------------------------------------------------------------

class TestTaskCrossCompany:

    def test_cannot_create_root_task_in_other_company_project(
        self, client: TestClient, project: dict, other_pm_user: tuple[User, str], other_pm_headers: dict
    ) -> None:
        other_pm, _ = other_pm_user
        now = _utcnow()
        r = client.post(f"{API}/projects/{project['id']}/tasks", json={
            "name": "Cross-company root task",
            "project_id": project["id"],
            "assignee_id": str(other_pm.id),
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(days=10)).isoformat(),
        }, headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_view_task_from_other_company(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_headers: dict,
    ) -> None:
        pm, _ = pm_user
        task = _create_root_task(client, pm_headers, project["id"], str(pm.id))
        r = client.get(f"{API}/tasks/{task['id']}", headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_update_task_from_other_company(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_headers: dict,
    ) -> None:
        pm, _ = pm_user
        task = _create_root_task(client, pm_headers, project["id"], str(pm.id))
        r = client.patch(f"{API}/tasks/{task['id']}", json={"name": "hack"}, headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_create_child_task_under_other_company_parent(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_user: tuple[User, str], other_pm_headers: dict,
    ) -> None:
        pm, _ = pm_user
        other_pm, _ = other_pm_user
        task = _create_root_task(client, pm_headers, project["id"], str(pm.id))
        now = _utcnow()
        r = client.post(f"{API}/tasks/{task['id']}/children", json={
            "name": "Cross-company child",
            "project_id": str(uuid.uuid4()),
            "assignee_id": str(other_pm.id),
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(days=5)).isoformat(),
        }, headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_view_other_company_gantt(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/{project['id']}/gantt", headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_list_tasks_from_other_company_project(
        self, client: TestClient, project: dict, other_pm_headers: dict
    ) -> None:
        r = client.get(f"{API}/projects/{project['id']}/tasks", headers=other_pm_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-08-04/06: Task tree + dependency (same company)
# ---------------------------------------------------------------------------

class TestTaskTreeAndDependency:

    def test_create_child_task_under_root(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-08-04: Level-0 root task can have a level-1 child."""
        pm, _ = pm_user
        root = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Hạng mục A")
        child = _create_child_task(client, pm_headers, root["id"], str(pm.id), name="Công việc A.1")
        assert child["parent_id"] == root["id"]
        assert child["level"] == root["level"] + 1

    def test_add_dependency_between_same_project_tasks(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-08-05: FS dependency giữa 2 task cùng project."""
        pm, _ = pm_user
        t1 = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Blocker")
        t2 = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Dependent")
        r = client.post(f"{API}/tasks/{t2['id']}/dependencies", json={
            "blocking_task_id": t1["id"],
            "dependent_task_id": t2["id"],
            "dependency_type": "FS",
            "lag_hours": 0,
        }, headers=pm_headers)
        assert r.status_code == 201, r.text

    def test_cannot_create_dependency_across_projects(
        self, client: TestClient, project: dict, other_project: dict,
        pm_user: tuple[User, str], pm_headers: dict,
    ) -> None:
        """TC-08-06: Task ở 2 project khác nhau không được phụ thuộc lẫn nhau."""
        pm, _ = pm_user
        t1 = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Local task")
        # A task from another (foreign) project — pm has no access, so fabricate via same
        # company's own second project instead, to isolate the "different project" rule
        # from the "different company" rule already covered above.
        t3 = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Another local task")
        second_project = _create_project(client, pm_headers, str(pm.id), name="Second project same co")
        t2 = _create_root_task(client, pm_headers, second_project["id"], str(pm.id), name="Other project task")
        r = client.post(f"{API}/tasks/{t2['id']}/dependencies", json={
            "blocking_task_id": t1["id"],
            "dependent_task_id": t2["id"],
            "dependency_type": "FS",
            "lag_hours": 0,
        }, headers=pm_headers)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# TC-08-07: Template (task profile) — save & apply
# ---------------------------------------------------------------------------

class TestTaskTemplate:

    def test_save_and_apply_template_same_company(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        pm, _ = pm_user
        root = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Hạng mục mẫu")
        _create_child_task(client, pm_headers, root["id"], str(pm.id), name="Bước 1")

        r = client.post(f"{API}/task-profiles/from-task/{root['id']}", json={
            "name": "Mẫu lắp đặt chuẩn",
        }, headers=pm_headers)
        assert r.status_code == 201, r.text
        profile = r.json()
        assert len(profile["items"]) == 2

        target_project = _create_project(client, pm_headers, str(pm.id), name="Target for template")
        r = client.post(f"{API}/task-profiles/{profile['id']}/apply", json={
            "project_id": target_project["id"],
            "assignee_id": str(pm.id),
        }, headers=pm_headers)
        assert r.status_code == 201, r.text
        created = r.json()
        assert len(created) == 2

    def test_cannot_save_template_from_other_company_task(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_headers: dict,
    ) -> None:
        pm, _ = pm_user
        root = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Private root")
        r = client.post(f"{API}/task-profiles/from-task/{root['id']}", json={
            "name": "Stolen template",
        }, headers=other_pm_headers)
        assert r.status_code == 403

    def test_cannot_apply_template_into_other_company_project(
        self, client: TestClient, project: dict, other_project: dict,
        pm_user: tuple[User, str], pm_headers: dict, other_pm_headers: dict,
    ) -> None:
        pm, _ = pm_user
        root = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Hạng mục riêng tư")
        r = client.post(f"{API}/task-profiles/from-task/{root['id']}", json={
            "name": "Mẫu riêng tư",
        }, headers=pm_headers)
        assert r.status_code == 201, r.text
        profile = r.json()

        # A user from another company must not be able to apply this profile
        # (403 either at the profile-company check or the target-project check).
        r = client.post(f"{API}/task-profiles/{profile['id']}/apply", json={
            "project_id": other_project["id"],
            "assignee_id": str(pm.id),
        }, headers=other_pm_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TC-08-08: Superuser bypass
# ---------------------------------------------------------------------------

class TestSuperuserBypass:

    def test_superuser_can_view_any_company_project_and_task(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        superuser_token_headers: dict,
    ) -> None:
        """Superuser must see projects/tasks belonging to a company they aren't a member of."""
        pm, _ = pm_user
        task = _create_root_task(client, pm_headers, project["id"], str(pm.id), name="Su-visible task")

        r = client.get(f"{API}/projects/{project['id']}", headers=superuser_token_headers)
        assert r.status_code == 200, r.text

        r = client.get(f"{API}/tasks/{task['id']}", headers=superuser_token_headers)
        assert r.status_code == 200, r.text
