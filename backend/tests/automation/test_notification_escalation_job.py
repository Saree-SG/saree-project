"""
Tests for the unread task-assignment escalation Celery job.

Covers:
  - A `task_assigned` notification unread for > 30 min escalates to BOTH the task
    creator (assignor) and the assignee's department head.
  - Dedup: a second run does not re-escalate (AuditLog flag).
  - A recently-created unread notification (< 30 min) is NOT escalated.
  - An already-read notification is NOT escalated.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.crud import create_user
from app.jobs import notification_escalation_job as job
from app.models.notification import Notification
from app.models.org import Company, Department, Role, UserCompanyRole
from app.models.project import Project
from app.models.task import AuditLog, Task
from app.models.user import User, UserCreate

ESC_TYPE = "task_assignment_unread"


def _make_user(db: Session, suffix: str, **fields) -> User:
    email = f"esc_{suffix}_{uuid.uuid4().hex[:6]}@example.com"
    user = create_user(
        session=db, user_create=UserCreate(email=email, password=f"Testpass1!{suffix}")
    )
    for k, v in fields.items():
        setattr(user, k, v)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def world(db: Session):
    """Build company + department + users + project + task in one shot."""
    company = Company(name="Esc Co", slug=f"esc-co-{uuid.uuid4().hex[:6]}")
    db.add(company)
    db.commit()
    db.refresh(company)

    dept = Department(company_id=company.id, name="Esc Dept")
    db.add(dept)
    db.commit()
    db.refresh(dept)

    head_role = Role(
        company_id=company.id,
        name="department_head",
        display_name="Trưởng Phòng",
        level=2,
        is_system=True,
    )
    db.add(head_role)
    db.commit()
    db.refresh(head_role)

    assignor = _make_user(db, "assignor", company_id=company.id)
    assignee = _make_user(
        db, "assignee", company_id=company.id, department_id=dept.id, full_name="Người Làm"
    )
    head = _make_user(db, "head", company_id=company.id, department_id=dept.id)
    db.add(
        UserCompanyRole(
            user_id=head.id, company_id=company.id, role_id=head_role.id, is_primary=True
        )
    )
    db.commit()

    project = Project(
        name="Esc Project",
        code=f"EP-{uuid.uuid4().hex[:6].upper()}",
        company_id=company.id,
        pm_id=assignor.id,
        created_by=assignor.id,
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        status="active",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    now = datetime.now(timezone.utc)
    task = Task(
        name="Esc Task",
        project_id=project.id,
        assignor_id=assignor.id,
        assignee_id=assignee.id,
        start_time=now,
        end_time=now + timedelta(days=5),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return {
        "company": company,
        "dept": dept,
        "assignor": assignor,
        "assignee": assignee,
        "head": head,
        "task": task,
    }


def _make_notification(db: Session, world, *, age_minutes: int, is_read: bool) -> Notification:
    notif = Notification(
        user_id=world["assignee"].id,
        type="task_assigned",
        title="Bạn được giao công việc",
        body=None,
        entity_type="task",
        entity_id=world["task"].id,
        is_read=is_read,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=age_minutes),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def _run_job(monkeypatch, test_engine: Engine) -> dict:
    """Point the job at the test engine and run it synchronously."""
    monkeypatch.setattr(job, "sync_engine", test_engine)
    return job.escalate_unread_assignments.apply().get()


def _escalation_notifs(db: Session, task_id) -> list[Notification]:
    return db.exec(
        select(Notification).where(
            Notification.type == ESC_TYPE, Notification.entity_id == task_id
        )
    ).all()


def test_escalates_stale_unread_to_creator_and_dept_head(
    db: Session, test_engine: Engine, world, monkeypatch
):
    notif = _make_notification(db, world, age_minutes=40, is_read=False)

    result = _run_job(monkeypatch, test_engine)
    assert result["escalated"] >= 1

    recipients = {n.user_id for n in _escalation_notifs(db, world["task"].id)}
    assert recipients == {world["assignor"].id, world["head"].id}

    flag = db.exec(
        select(AuditLog).where(
            AuditLog.entity_type == "notification",
            AuditLog.entity_id == notif.id,
            AuditLog.action == "notification.escalated",
        )
    ).first()
    assert flag is not None


def test_dedup_no_double_escalation(
    db: Session, test_engine: Engine, world, monkeypatch
):
    _make_notification(db, world, age_minutes=40, is_read=False)

    _run_job(monkeypatch, test_engine)
    count_after_first = len(_escalation_notifs(db, world["task"].id))
    assert count_after_first == 2  # creator + dept head

    _run_job(monkeypatch, test_engine)
    assert len(_escalation_notifs(db, world["task"].id)) == count_after_first


def test_recent_unread_not_escalated(
    db: Session, test_engine: Engine, world, monkeypatch
):
    _make_notification(db, world, age_minutes=10, is_read=False)

    result = _run_job(monkeypatch, test_engine)
    assert result["escalated"] == 0
    assert _escalation_notifs(db, world["task"].id) == []


def test_read_notification_not_escalated(
    db: Session, test_engine: Engine, world, monkeypatch
):
    _make_notification(db, world, age_minutes=40, is_read=True)

    result = _run_job(monkeypatch, test_engine)
    assert result["escalated"] == 0
    assert _escalation_notifs(db, world["task"].id) == []
