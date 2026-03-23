"""
Dashboard API — aggregate KPIs across users, projects, tasks.
Routes: /dashboard/
"""
from __future__ import annotations

from datetime import timezone
from typing import Any
import uuid

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, get_db
from app.models.org import ProjectMemberRole
from app.models.project import Project
from app.models.task import AuditLog, Task, TaskProof
from app.models.user import User
from app.shared.task_service import compute_task_status, utcnow

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _project_ids_scope(
    session: Session,
    current_user: User,
    project_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """Return scoped project IDs based on optional filters."""
    q = select(Project.id).where(
        Project.company_id == current_user.company_id,
        Project.is_deleted == False,  # noqa
    )
    if project_id is not None:
        q = q.where(Project.id == project_id)
    if department_id is not None:
        q = q.where(Project.department_id == department_id)
    return list(session.exec(q).all())


@router.get("/overview")
def overview(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict[str, Any]:
    """High-level KPI cards."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return {
            "total_projects": 0,
            "total_tasks": 0,
            "done_tasks": 0,
            "completion_rate_pct": 0.0,
            "overdue_tasks": 0,
        }

    total_projects = session.exec(
        select(func.count(Project.id)).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa
        )
    ).one()

    total_tasks = session.exec(
        select(func.count(Task.id)).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False  # noqa
        )
    ).one()

    done_tasks = session.exec(
        select(func.count(Task.id)).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status == "done",
            Task.is_deleted == False,  # noqa
        )
    ).one()

    completion_rate = round(done_tasks / total_tasks * 100, 1) if total_tasks else 0.0

    # Overdue: past deadline and not done (computed on-read)
    now = utcnow()
    overdue_count = session.exec(
        select(func.count(Task.id)).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.end_time < now,
            Task.status.notin_(["done", "review"]),  # type: ignore
            Task.is_deleted == False,  # noqa
        )
    ).one()

    return {
        "total_projects": total_projects,
        "total_tasks": total_tasks,
        "done_tasks": done_tasks,
        "completion_rate_pct": completion_rate,
        "overdue_tasks": overdue_count,
    }


@router.get("/projects/stats")
def project_stats(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Per-project task completion stats."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []
    projects = session.exec(
        select(Project).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa
        )
    ).all()

    now = utcnow()
    result = []
    for p in projects:
        tasks = session.exec(
            select(Task).where(Task.project_id == p.id, Task.is_deleted == False)  # noqa
        ).all()
        total = len(tasks)
        done = sum(1 for t in tasks if t.status == "done")
        overdue = sum(
            1 for t in tasks
            if t.end_time < now and t.status not in ("done", "review")
        )
        result.append({
            "project_id": str(p.id),
            "name": p.name,
            "status": p.status,
            "total_tasks": total,
            "done_tasks": done,
            "overdue_tasks": overdue,
            "completion_pct": round(done / total * 100, 1) if total else 0,
        })
    return result


@router.get("/users/workload")
def user_workload(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Active task count per user — 'bàn cờ nhân sự'."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []
    rows = session.exec(
        select(Task.assignee_id, func.count(Task.id).label("active_tasks"))
        .where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status.notin_(["done"]),  # type: ignore
            Task.is_deleted == False,
        )
        .group_by(Task.assignee_id)
        .order_by(func.count(Task.id).desc())
    ).all()
    return [
        {"user_id": str(row.assignee_id), "active_tasks": row.active_tasks}
        for row in rows
    ]


@router.get("/leaderboard")
def leaderboard(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Top performers: highest task completion rate."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []
    now = utcnow()
    all_tasks = session.exec(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,
        )
    ).all()

    stats: dict[str, dict] = {}
    for t in all_tasks:
        uid = str(t.assignee_id)
        if uid not in stats:
            stats[uid] = {"total": 0, "done": 0, "on_time": 0, "overdue": 0}
        stats[uid]["total"] += 1
        if t.status == "done":
            stats[uid]["done"] += 1
            if t.actual_end_time and t.actual_end_time <= t.end_time:
                stats[uid]["on_time"] += 1
        elif t.end_time < now:
            stats[uid]["overdue"] += 1

    board = [
        {
            "user_id": uid,
            "total": s["total"],
            "done": s["done"],
            "on_time": s["on_time"],
            "overdue": s["overdue"],
            "completion_pct": round(s["done"] / s["total"] * 100, 1) if s["total"] else 0,
        }
        for uid, s in stats.items()
    ]
    return sorted(board, key=lambda x: x["completion_pct"], reverse=True)[:20]


@router.get("/overdue")
def overdue_report(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict:
    """Detailed overdue report: local (warning) vs critical (blocking)."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return {"overdue_critical": [], "overdue_local": []}
    now = utcnow()
    overdue_tasks = session.exec(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.end_time < now,
            Task.status.notin_(["done", "review"]),  # type: ignore
            Task.is_deleted == False,  # noqa
        )
    ).all()

    local, critical = [], []
    for t in session.exec(select(Task).where(Task.is_deleted == False)).all():  # noqa
        pass  # prevent session expiry

    for t in overdue_tasks:
        parent = session.get(Task, t.parent_id) if t.parent_id else None
        cs = compute_task_status(t, parent)
        item = {
            "task_id": str(t.id),
            "name": t.name,
            "assignee_id": str(t.assignee_id),
            "end_time": t.end_time.isoformat(),
            "project_id": str(t.project_id),
            "is_on_critical_path": t.is_on_critical_path,
        }
        if cs == "overdue_critical":
            critical.append(item)
        else:
            local.append(item)

    return {"overdue_critical": critical, "overdue_local": local}


@router.get("/tasks/calendar")
def task_calendar(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Task density per day (for calendar heatmap view)."""
    project_ids = _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []
    rows = session.exec(
        select(
            func.date(Task.end_time).label("due_date"),
            func.count(Task.id).label("count"),
        )
        .where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,
        )
        .group_by(func.date(Task.end_time))
        .order_by(func.date(Task.end_time))
    ).all()
    return [{"date": str(row.due_date), "count": row.count} for row in rows]
