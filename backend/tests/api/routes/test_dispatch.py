"""
Integration tests for Điều phối (dispatch) — TC-09.

Coverage:
  - TC-09-01: understaffed_tasks trả về đúng task thiếu người (required_headcount > assigned).
  - TC-09-02: suggest-assignees không crash (bug cũ: Task.company_id không tồn tại trên model,
    khiến mọi request 500 Internal Server Error) và trả về ứng viên hợp lệ, xếp hạng theo điểm.
  - TC-09-03: Ứng viên gợi ý không bao gồm người đã được gán vào task.
  - TC-09-04: suggest-assignees cho task ở công ty khác → không trả về ứng viên (không lộ dữ
    liệu tọa độ công trình/nhân sự chéo công ty).
  - TC-09-05: team-productivity (KPI) chỉ tính trên công ty của user hiện tại.
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
from app.models.skill import Skill, UserSkill
from app.models.user import User, UserCreate

API = settings.API_V1_STR


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
    email = f"test_disp_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(session=mdb, user_create=UserCreate(email=email, password=password, is_active=True))
    user.company_id = company.id
    mdb.add(user)
    mdb.add(UserCompanyRole(user_id=user.id, company_id=company.id, role_id=role.id, is_primary=True))
    mdb.commit()
    mdb.refresh(user)
    return user, password


def _create_project(client: TestClient, headers: dict, pm_id: str) -> dict:
    today = date.today()
    r = client.post(f"{API}/projects/", json={
        "name": f"DispProj-{uuid.uuid4().hex[:6]}",
        "code": f"DP{uuid.uuid4().hex[:5].upper()}",
        "start_date": str(today),
        "end_date": str(today + timedelta(days=90)),
        "project_type": "internal",
        "pm_id": pm_id,
    }, headers=headers)
    assert r.status_code == 201, f"create_project failed: {r.text}"
    return r.json()


def _create_task(client: TestClient, headers: dict, project_id: str, assignee_id: str,
                  required_headcount: int = 1, name: str = "Task") -> dict:
    now = _utcnow()
    r = client.post(f"{API}/projects/{project_id}/tasks", json={
        "name": name,
        "project_id": project_id,
        "assignee_id": assignee_id,
        "required_headcount": required_headcount,
        "start_time": now.isoformat(),
        "end_time": (now + timedelta(days=10)).isoformat(),
    }, headers=headers)
    assert r.status_code == 201, f"create_task failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def mdb(test_engine: Engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture(scope="module")
def company(mdb: Session) -> Company:
    c = Company(name=f"DispCo-{uuid.uuid4().hex[:6]}", slug=f"dispco-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


@pytest.fixture(scope="module")
def other_company(mdb: Session) -> Company:
    c = Company(name=f"DispOther-{uuid.uuid4().hex[:6]}", slug=f"dispother-{uuid.uuid4().hex[:6]}")
    mdb.add(c)
    mdb.commit()
    mdb.refresh(c)
    return c


PM_PERMS = [
    "PROJECT_CREATE", "PROJECT_VIEW", "PROJECT_VIEW_ALL", "PROJECT_UPDATE", "PROJECT_MANAGE_MEMBERS",
    "TASK_CREATE", "TASK_VIEW", "TASK_UPDATE",
]


@pytest.fixture(scope="module")
def pm_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "manager", 1, PM_PERMS)


@pytest.fixture(scope="module")
def worker_role(mdb: Session, company: Company) -> Role:
    return _make_role(mdb, company, "Worker", 3, ["TASK_VIEW"])


@pytest.fixture(scope="module")
def pm_user(mdb: Session, company: Company, pm_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, pm_role, "pm")


@pytest.fixture(scope="module")
def worker_user(mdb: Session, company: Company, worker_role: Role) -> tuple[User, str]:
    return _make_user(mdb, company, worker_role, "worker")


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


class TestUnderstaffedTasks:

    def test_understaffed_task_appears(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict
    ) -> None:
        """TC-09-01: Task với required_headcount > số người gán → xuất hiện trong danh sách."""
        pm, _ = pm_user
        task = _create_task(client, pm_headers, project["id"], str(pm.id),
                             required_headcount=3, name="Cần 3 người")
        r = client.get(f"{API}/dashboard/understaffed-tasks", headers=pm_headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(row["task_id"] == task["id"] for row in rows)


class TestSuggestAssignees:

    def test_suggest_assignees_does_not_crash(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], worker_user: tuple[User, str],
        pm_headers: dict,
    ) -> None:
        """TC-09-02: GET suggest-assignees phải trả 200, không phải 500
        (bug cũ: Task.company_id không tồn tại trên model Task)."""
        pm, _ = pm_user
        task = _create_task(client, pm_headers, project["id"], str(pm.id), required_headcount=2)
        r = client.get(f"{API}/tasks/{task['id']}/suggest-assignees", headers=pm_headers)
        assert r.status_code == 200, r.text
        candidates = r.json()
        assert isinstance(candidates, list)
        # Worker in the same company must appear as a candidate.
        assert any(c["user_id"] == str(worker_user[0].id) for c in candidates)

    def test_already_assigned_user_excluded(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], worker_user: tuple[User, str],
        pm_headers: dict,
    ) -> None:
        """TC-09-03: Người đã gán vào task không xuất hiện trong gợi ý."""
        pm, _ = pm_user
        worker, _ = worker_user
        task = _create_task(client, pm_headers, project["id"], str(pm.id), required_headcount=2)
        r = client.post(f"{API}/tasks/{task['id']}/assignees",
                         json={"user_id": str(worker.id)}, headers=pm_headers)
        assert r.status_code == 201, r.text

        r = client.get(f"{API}/tasks/{task['id']}/suggest-assignees", headers=pm_headers)
        assert r.status_code == 200, r.text
        candidates = r.json()
        assert all(c["user_id"] != str(worker.id) for c in candidates)

    def test_suggest_assignees_for_other_company_task_returns_empty(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_headers: dict,
    ) -> None:
        """TC-09-04: Task ở công ty khác → không lộ ứng viên/tọa độ chéo công ty."""
        pm, _ = pm_user
        task = _create_task(client, pm_headers, project["id"], str(pm.id), required_headcount=2)
        r = client.get(f"{API}/tasks/{task['id']}/suggest-assignees", headers=other_pm_headers)
        assert r.status_code == 200
        assert r.json() == []


class TestTeamProductivityScope:

    def test_team_productivity_scoped_to_own_company(
        self, client: TestClient, project: dict, pm_user: tuple[User, str], pm_headers: dict,
        other_pm_headers: dict,
    ) -> None:
        """TC-09-05: /dashboard/team-productivity không lộ dữ liệu công ty khác."""
        pm, _ = pm_user
        r = client.get(f"{API}/dashboard/team-productivity", headers=other_pm_headers)
        assert r.status_code == 200
        rows = r.json().get("rows", [])
        assert all(row["user_id"] != str(pm.id) for row in rows)
