import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import or_
from sqlmodel import Session, delete, select

from app.core.config import settings
from app.models.org import Company, Role
from app.models.task import (
    AuditLog,
    Task,
    TaskComment,
    TaskDependency,
    TaskObserver,
    TaskProof,
)
from app.models.project import Project, TaskLevelConfig
from app.models.org import ProjectMemberRole
from app.models.user import User
from app.scripts.seed_defaults import seed as seed_defaults_seed

from tests.utils.utils import random_lower_string


def _to_uuid(value: str) -> uuid.UUID:
    """Convert API UUID strings into uuid.UUID."""
    return uuid.UUID(str(value))


def _delete_entities(
    session: Session,
    *,
    project_id: uuid.UUID,
    task_ids: list[uuid.UUID],
) -> None:
    """Delete MES entities created by this smoke test."""
    session.exec(
        delete(AuditLog).where(
            or_(
                (AuditLog.entity_type == "task")
                & (AuditLog.entity_id.in_(task_ids)),
                (AuditLog.entity_type == "project")
                & (AuditLog.entity_id == project_id),
            )
        )
    )
    session.exec(
        delete(TaskDependency).where(
            or_(
                TaskDependency.blocking_task_id.in_(task_ids),
                TaskDependency.dependent_task_id.in_(task_ids),
            )
        )
    )
    session.exec(
        delete(TaskObserver).where(TaskObserver.task_id.in_(task_ids))
    )
    session.exec(
        delete(TaskComment).where(TaskComment.task_id.in_(task_ids))
    )
    session.exec(
        delete(TaskProof).where(TaskProof.task_id.in_(task_ids))
    )
    session.exec(delete(Task).where(Task.id.in_(task_ids)))
    session.exec(
        delete(TaskLevelConfig).where(TaskLevelConfig.project_id == project_id)
    )
    session.exec(
        delete(ProjectMemberRole).where(
            ProjectMemberRole.project_id == project_id
        )
    )
    session.exec(delete(Project).where(Project.id == project_id))
    session.commit()


def _cleanup_projects_created_by(
    session: Session,
    *,
    created_by_user_id: uuid.UUID,
) -> None:
    """Delete all projects created by the given user (test DB hygiene)."""
    projects = session.exec(
        select(Project).where(Project.created_by == created_by_user_id)
    ).all()
    for project in projects:
        task_rows = session.exec(
            select(Task.id).where(Task.project_id == project.id)
        ).all()
        task_ids = [row for row in task_rows]
        _delete_entities(
            session,
            project_id=project.id,
            task_ids=task_ids,
        )


def _login_as(
    client: TestClient,
    *,
    email: str,
    password: str,
) -> dict[str, str]:
    """Login helper for tests that need a token."""
    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    tokens = r.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _login_tokens(
    client: TestClient,
    *,
    email: str,
    password: str,
) -> dict[str, str]:
    """Login helper returning full token payload."""

    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()


import pytest


@pytest.fixture(scope="function", autouse=True)
def seed_defaults_once(db: Session) -> None:
    """Seed RBAC defaults and a base company once for the test session.

    Must use the test session/engine (isolated schema) instead of the script's
    global engine, otherwise tables won't exist in the public schema.
    """

    company = db.exec(select(Company).where(Company.slug == "default")).first()
    if company is None:
        company = Company(name="Default Company", slug="default")
        db.add(company)
        db.commit()
        db.refresh(company)
    seed_defaults_seed(db, company.id)


@pytest.fixture(autouse=True)
def disable_event_bus_emit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disable EventBus background emissions to avoid async side effects."""
    from app.shared.event_bus import event_bus

    def noop_emit(event: str, payload: dict | None = None) -> None:
        """No-op replacement for event bus emitter."""
        return None

    monkeypatch.setattr(event_bus, "emit", noop_emit)


@pytest.fixture(scope="function")
def default_company_and_admin(db: Session) -> uuid.UUID:
    """Ensure the first superuser has company_id set to the seeded company."""
    company = db.exec(select(Company).where(Company.slug == "default")).first()
    assert company is not None

    admin = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert admin is not None

    if admin.company_id != company.id:
        admin.company_id = company.id
        db.add(admin)
        db.commit()
        db.refresh(admin)

    return company.id


@pytest.fixture(scope="function")
def mes_entities(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
    default_company_and_admin: uuid.UUID,
) -> dict[str, Any]:
    """Create minimal MES entities for endpoint smoke tests."""
    worker_role = db.exec(
        select(Role).where(
            Role.company_id == default_company_and_admin,
            Role.name == "worker",
        )
    ).first()
    assert worker_role is not None

    admin = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert admin is not None

    _cleanup_projects_created_by(db, created_by_user_id=admin.id)

    member_email = f"{random_lower_string()}@example.com"
    member_password = random_lower_string()
    member_full_name = "Automation Member"
    r = client.post(
        f"{settings.API_V1_STR}/users/signup",
        json={
            "email": member_email,
            "password": member_password,
            "full_name": member_full_name,
        },
    )
    assert r.status_code == 200
    member_user_id = _to_uuid(r.json()["id"])

    start = date.today()
    end = date.today() + timedelta(days=30)
    project_code = f"AUTO-{uuid.uuid4().hex[:8]}"
    r = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=superuser_token_headers,
        json={
            "name": "Automation Project",
            "code": project_code,
            "description": "Created by automation smoke tests",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "status": "planning",
            "department_id": None,
        },
    )
    assert r.status_code == 201
    project_id = _to_uuid(r.json()["id"])

    r = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/level-config",
        headers=superuser_token_headers,
        json={
            "level": 0,
            "label": "Root Level",
            "requires_proof": False,
            "can_have_children": True,
            "max_children": None,
        },
    )
    assert r.status_code == 201
    level_config_id = _to_uuid(r.json()["id"])

    r = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/members",
        headers=superuser_token_headers,
        params={"user_id": str(member_user_id), "role_id": str(worker_role.id)},
    )
    assert r.status_code == 201

    root_start = datetime.now(timezone.utc) + timedelta(days=1)
    root_end = root_start + timedelta(days=2)
    r = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/tasks",
        headers=superuser_token_headers,
        json={
            "project_id": str(project_id),
            "name": "Root Task",
            "description": "Root task created by automation tests",
            "start_time": root_start.isoformat(),
            "end_time": root_end.isoformat(),
            "assignee_id": str(member_user_id),
            "priority": "medium",
        },
    )
    assert r.status_code == 201
    root_task_id = _to_uuid(r.json()["id"])

    child_start = root_start + timedelta(hours=2)
    child_end = root_start + timedelta(hours=6)
    r = client.post(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/children",
        headers=superuser_token_headers,
        json={
            "project_id": str(project_id),
            "name": "Child Task",
            "description": "Child created by automation tests",
            "start_time": child_start.isoformat(),
            "end_time": child_end.isoformat(),
            "assignee_id": str(member_user_id),
            "priority": "medium",
        },
    )
    assert r.status_code == 201
    child_task_id = _to_uuid(r.json()["id"])

    r = client.post(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/dependencies",
        headers=superuser_token_headers,
        json={
            "blocking_task_id": str(root_task_id),
            "dependent_task_id": str(child_task_id),
            "lag_hours": 0,
        },
    )
    assert r.status_code == 201

    r = client.post(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/comments",
        headers=superuser_token_headers,
        json={"content": "Automation comment", "comment_type": "general"},
    )
    assert r.status_code == 201
    comment_id = _to_uuid(r.json()["id"])

    r = client.post(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/proofs",
        headers=superuser_token_headers,
        json={
            "file_url": "https://example.com/proof.png",
            "file_type": "image",
            "note": "Automation proof",
        },
    )
    assert r.status_code == 201
    proof_id = _to_uuid(r.json()["id"])

    r = client.patch(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/proofs/{proof_id}",
        headers=superuser_token_headers,
        params={"review_status": "approved", "review_note": "Looks good"},
    )
    assert r.status_code == 200

    r = client.post(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/clone",
        headers=superuser_token_headers,
    )
    assert r.status_code == 201
    cloned_root_task_id = _to_uuid(r.json()["id"])

    cloned_child_task_ids = [
        _to_uuid(t.id)
        for t in db.exec(select(Task).where(Task.parent_id == cloned_root_task_id)).all()
    ]

    delete_task_start = datetime.now(timezone.utc) + timedelta(days=3)
    delete_task_end = delete_task_start + timedelta(days=1)
    r = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/tasks",
        headers=superuser_token_headers,
        json={
            "project_id": str(project_id),
            "name": "Delete Task",
            "description": "Task dedicated to delete endpoint test",
            "start_time": delete_task_start.isoformat(),
            "end_time": delete_task_end.isoformat(),
            "assignee_id": str(member_user_id),
            "priority": "medium",
        },
    )
    assert r.status_code == 201
    delete_task_id = _to_uuid(r.json()["id"])

    yield {
        "project_id": project_id,
        "level_config_id": level_config_id,
        "member_user_id": member_user_id,
        "worker_role_id": _to_uuid(str(worker_role.id)),
        "root_task_id": root_task_id,
        "child_task_id": child_task_id,
        "delete_task_id": delete_task_id,
        "comment_id": comment_id,
        "proof_id": proof_id,
        "cloned_root_task_id": cloned_root_task_id,
        "cloned_child_task_ids": cloned_child_task_ids,
    }

    task_ids: list[uuid.UUID] = [
        root_task_id,
        child_task_id,
        delete_task_id,
        cloned_root_task_id,
        *cloned_child_task_ids,
    ]
    _delete_entities(
        db,
        project_id=project_id,
        task_ids=task_ids,
    )


def test_public_endpoints_smoke(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    """Smoke test public endpoints and auth errors for protected endpoints."""
    r = client.get(f"{settings.API_V1_STR}/utils/health-check/")
    assert r.status_code == 200
    assert r.json() is True

    r = client.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={"username": settings.FIRST_SUPERUSER, "password": "wrong-password"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Incorrect email or password"

    random_email = f"{random_lower_string()}@example.com"
    r = client.post(
        f"{settings.API_V1_STR}/password-recovery/{random_email}",
    )
    assert r.status_code == 200
    assert r.json()["message"] == (
        "If that email is registered, we sent a password recovery link"
    )

    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        json={"token": "invalid", "new_password": "new-password"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid token"

    r = client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json()["email"] == settings.FIRST_SUPERUSER

    tokens = _login_tokens(
        client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )
    r = client.post(
        f"{settings.API_V1_STR}/login/refresh-token",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 200
    refreshed = r.json()
    assert "access_token" in refreshed
    assert "refresh_token" in refreshed

    r = client.post(
        f"{settings.API_V1_STR}/login/logout",
        headers={"Authorization": f"Bearer {refreshed['access_token']}"},
        json={"refresh_token": refreshed["refresh_token"]},
    )
    assert r.status_code == 200

    r = client.post(
        f"{settings.API_V1_STR}/password-recovery-html-content/{settings.FIRST_SUPERUSER}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert len(r.text) > 0

    r = client.post(
        f"{settings.API_V1_STR}/utils/test-email/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 422

    r = client.get(f"{settings.API_V1_STR}/users/")
    assert r.status_code == 401

    email_to_create = f"{random_lower_string()}@listo.com"
    if settings.ENVIRONMENT != "local":
        pytest.skip("Private routes are enabled only in local environment.")

    r = client.post(
        f"{settings.API_V1_STR}/private/users/",
        json={
            "email": email_to_create,
            "password": "password123",
            "full_name": "Pollo Listo",
        },
    )
    assert r.status_code == 200
    assert r.json()["email"] == email_to_create


def test_users_smoke(client: TestClient) -> None:
    """Smoke test users/signup and self profile via auth."""
    email = f"{random_lower_string()}@example.com"
    password = random_lower_string()

    r = client.post(
        f"{settings.API_V1_STR}/users/signup",
        json={"email": email, "password": password, "full_name": "Automation User"},
    )
    assert r.status_code == 200

    headers = _login_as(client, email=email, password=password)

    r = client.get(f"{settings.API_V1_STR}/users/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_mes_projects_tasks_dashboard_smoke(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    mes_entities: dict[str, Any],
) -> None:
    """Smoke test MES endpoints: projects, tasks, comments, proofs, audit, dashboard."""
    project_id: uuid.UUID = mes_entities["project_id"]
    root_task_id: uuid.UUID = mes_entities["root_task_id"]
    child_task_id: uuid.UUID = mes_entities["child_task_id"]
    delete_task_id: uuid.UUID = mes_entities["delete_task_id"]
    cloned_root_task_id: uuid.UUID = mes_entities["cloned_root_task_id"]
    member_user_id: uuid.UUID = mes_entities["member_user_id"]
    proof_id: uuid.UUID = mes_entities["proof_id"]

    r = client.get(f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers)
    assert r.status_code == 200
    content = r.json()
    assert "data" in content and "count" in content

    r = client.get(f"{settings.API_V1_STR}/projects/{project_id}", headers=superuser_token_headers)
    assert r.status_code == 200
    assert _to_uuid(r.json()["id"]) == project_id

    r = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}",
        headers=superuser_token_headers,
        json={"status": "active"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    r = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/level-config",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/members",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert any(m["user_id"] == str(member_user_id) for m in r.json())

    r = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/tasks",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert "data" in r.json() and "count" in r.json()

    r = client.get(f"{settings.API_V1_STR}/tasks/{root_task_id}", headers=superuser_token_headers)
    assert r.status_code == 200
    assert _to_uuid(r.json()["id"]) == root_task_id

    r = client.patch(
        f"{settings.API_V1_STR}/tasks/{root_task_id}",
        headers=superuser_token_headers,
        json={"description": "Updated by automation smoke tests"},
    )
    assert r.status_code == 200

    r = client.patch(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/status",
        headers=superuser_token_headers,
        json={"status": "done", "note": "Completed by automation"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    r = client.get(
        f"{settings.API_V1_STR}/tasks/my/dashboard",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    dash = r.json()
    assert set(dash.keys()) == {
        "overdue_critical",
        "overdue_local",
        "due_soon",
        "today",
        "companies",
        "projects",
    }

    r = client.get(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/comments",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/proofs",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    proofs = r.json()
    assert any(_to_uuid(p["id"]) == proof_id for p in proofs)

    r = client.get(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/audit",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(
        f"{settings.API_V1_STR}/tasks/{root_task_id}/conflicts",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    conflict = r.json()
    assert "has_hard_conflict" in conflict
    assert "soft_conflicts" in conflict

    r = client.get(f"{settings.API_V1_STR}/tasks/{cloned_root_task_id}", headers=superuser_token_headers)
    assert r.status_code == 200
    assert _to_uuid(r.json()["id"]) == cloned_root_task_id

    r = client.delete(
        f"{settings.API_V1_STR}/tasks/{delete_task_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 204

    r = client.get(f"{settings.API_V1_STR}/dashboard/overview", headers=superuser_token_headers)
    assert r.status_code == 200
    assert "total_projects" in r.json()

    r = client.get(f"{settings.API_V1_STR}/dashboard/projects/stats", headers=superuser_token_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(f"{settings.API_V1_STR}/dashboard/users/workload", headers=superuser_token_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(f"{settings.API_V1_STR}/dashboard/leaderboard", headers=superuser_token_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get(f"{settings.API_V1_STR}/dashboard/overdue", headers=superuser_token_headers)
    assert r.status_code == 200
    assert "overdue_critical" in r.json()

    r = client.get(f"{settings.API_V1_STR}/dashboard/tasks/calendar", headers=superuser_token_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

