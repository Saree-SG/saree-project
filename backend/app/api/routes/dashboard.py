"""
Dashboard API — aggregate KPIs across users, projects, tasks.
Full async — no direct DB calls.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.project import Project
from app.models.task import Task, TaskProgressReport
from app.models.user import User
from app.services.task_service import compute_task_status
from app.shared.permission import require_any_permission

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[
        Depends(require_any_permission("REPORT_VIEW_ALL", "REPORT_VIEW_TEAM")),
    ],
)


def _utcnow() -> datetime:
    """Return naive UTC datetime for DB comparisons.

    DB columns in this project use `TIMESTAMP WITHOUT TIME ZONE`, so comparing
    against timezone-aware datetimes will crash in asyncpg.
    """

    return datetime.utcnow()


def _naive_utc(dt: datetime | None) -> datetime | None:
    """Normalize datetime to naive UTC for safe comparisons.

    Some environments/drivers may produce timezone-aware datetimes even when
    the DB column is `TIMESTAMP WITHOUT TIME ZONE`. This helper ensures we can
    compare values consistently inside Python code paths.
    """

    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


async def _project_ids_scope(
    session: AsyncSession,
    current_user: User,
    project_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """Return scoped project IDs based on optional filters."""
    stmt = select(Project.id).where(
        Project.company_id == current_user.company_id,
        Project.is_deleted == False,  # noqa: E712
    )
    if project_id is not None:
        stmt = stmt.where(Project.id == project_id)
    if department_id is not None:
        stmt = stmt.where(Project.department_id == department_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


def _effective_task_progress(task: Task, raw_progress_sum: int) -> int:
    """Return effective task progress percent (0-100) for dashboard aggregation."""
    if task.status in ("done", "review"):
        return 100
    return max(0, min(100, int(raw_progress_sum)))


@router.get("/overview")
async def overview(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict[str, Any]:
    """High-level KPI cards."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return {
            "total_projects": 0,
            "total_tasks": 0,
            "done_tasks": 0,
            "completion_rate_pct": 0.0,
            "overdue_tasks": 0,
        }

    total_projects = (await session.execute(
        select(func.count(Project.id)).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa: E712
        )
    )).scalar_one()

    tasks_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    tasks = tasks_result.scalars().all()
    total_tasks = len(tasks)
    done_tasks = sum(1 for task in tasks if task.status == "done")
    task_ids = [task.id for task in tasks]
    progress_by_task: dict[uuid.UUID, int] = {}
    if task_ids:
        progress_result = await session.execute(
            select(
                TaskProgressReport.task_id,
                func.coalesce(func.sum(TaskProgressReport.progress_percent), 0).label("progress_sum"),
            )
            .where(TaskProgressReport.task_id.in_(task_ids))  # type: ignore[arg-type]
            .group_by(TaskProgressReport.task_id)
        )
        progress_by_task = {
            row.task_id: int(row.progress_sum or 0)
            for row in progress_result.all()
        }
    total_progress = sum(
        _effective_task_progress(task, progress_by_task.get(task.id, 0))
        for task in tasks
    )
    completion_rate = round(total_progress / total_tasks, 1) if total_tasks else 0.0
    now = _utcnow()

    overdue_count = (await session.execute(
        select(func.count(Task.id)).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.end_time < now,
            Task.status.notin_(["done", "review"]),  # type: ignore[attr-defined]
            Task.is_deleted == False,  # noqa: E712
        )
    )).scalar_one()

    return {
        "total_projects": total_projects,
        "total_tasks": total_tasks,
        "done_tasks": done_tasks,
        "completion_rate_pct": completion_rate,
        "overdue_tasks": overdue_count,
    }


@router.get("/projects/stats")
async def project_stats(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Per-project task completion stats."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []

    projects_result = await session.execute(
        select(Project).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa: E712
        )
    )
    projects = projects_result.scalars().all()

    now = _utcnow()
    result = []
    for p in projects:
        tasks_result = await session.execute(
            select(Task).where(Task.project_id == p.id, Task.is_deleted == False)  # noqa: E712
        )
        tasks = tasks_result.scalars().all()
        total = len(tasks)
        done = sum(1 for t in tasks if t.status == "done")
        task_ids = [task.id for task in tasks]
        progress_by_task: dict[uuid.UUID, int] = {}
        if task_ids:
            progress_result = await session.execute(
                select(
                    TaskProgressReport.task_id,
                    func.coalesce(func.sum(TaskProgressReport.progress_percent), 0).label("progress_sum"),
                )
                .where(TaskProgressReport.task_id.in_(task_ids))  # type: ignore[arg-type]
                .group_by(TaskProgressReport.task_id)
            )
            progress_by_task = {
                row.task_id: int(row.progress_sum or 0)
                for row in progress_result.all()
            }
        total_progress = sum(
            _effective_task_progress(task, progress_by_task.get(task.id, 0))
            for task in tasks
        )
        overdue = sum(
            1
            for t in tasks
            if (_naive_utc(t.end_time) is not None)
            and _naive_utc(t.end_time) < now
            and t.status not in ("done", "review")
        )
        result.append({
            "project_id": str(p.id),
            "name": p.name,
            "status": p.status,
            "total_tasks": total,
            "done_tasks": done,
            "overdue_tasks": overdue,
            "completion_pct": round(total_progress / total, 1) if total else 0,
        })
    return result


@router.get("/users/workload")
async def user_workload(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Active task count per user — bàn cờ nhân sự."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []

    rows_result = await session.execute(
        select(Task.assignee_id, func.count(Task.id).label("active_tasks"))
        .where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status.notin_(["done"]),  # type: ignore[attr-defined]
            Task.is_deleted == False,  # noqa: E712
        )
        .group_by(Task.assignee_id)
        .order_by(func.count(Task.id).desc())
    )
    rows = rows_result.all()

    assignee_ids = [r.assignee_id for r in rows if r.assignee_id is not None]
    users_result = await session.execute(
        select(User).where(User.id.in_(assignee_ids))  # type: ignore[arg-type]
    ) if assignee_ids else None
    assignee_by_id: dict = {}
    if users_result:
        for u in users_result.scalars().all():
            assignee_by_id[u.id] = u

    return [
        {
            "user_id": str(r.assignee_id),
            "user_name": (
                assignee_by_id.get(r.assignee_id).full_name
                or assignee_by_id.get(r.assignee_id).email
                if assignee_by_id.get(r.assignee_id)
                else str(r.assignee_id)
            ),
            "active_tasks": r.active_tasks,
        }
        for r in rows
    ]


@router.get("/leaderboard")
async def leaderboard(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Top performers: highest task completion rate."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []

    now = _utcnow()
    tasks_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    all_tasks = tasks_result.scalars().all()

    stats: dict[str, dict] = {}
    for t in all_tasks:
        uid = str(t.assignee_id)
        if uid not in stats:
            stats[uid] = {"total": 0, "done": 0, "on_time": 0, "overdue": 0}
        stats[uid]["total"] += 1
        end_time = _naive_utc(t.end_time)
        actual_end_time = _naive_utc(t.actual_end_time)
        if t.status == "done":
            stats[uid]["done"] += 1
            if actual_end_time and end_time and actual_end_time <= end_time:
                stats[uid]["on_time"] += 1
        elif end_time and end_time < now:
            stats[uid]["overdue"] += 1

    assignee_uuid_ids = [uuid.UUID(uid) for uid in stats]
    if assignee_uuid_ids:
        users_result = await session.execute(
            select(User).where(User.id.in_(assignee_uuid_ids))  # type: ignore[arg-type]
        )
        assignee_by_id = {str(u.id): u for u in users_result.scalars().all()}
    else:
        assignee_by_id = {}

    board = [
        {
            "user_id": uid,
            "user_name": (
                assignee_by_id.get(uid).full_name or assignee_by_id.get(uid).email
                if assignee_by_id.get(uid)
                else uid
            ),
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
async def overdue_report(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict:
    """Detailed overdue report: local (warning) vs critical (blocking)."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return {"overdue_critical": [], "overdue_local": []}

    now = _utcnow()
    projects_result = await session.execute(
        select(Project).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa: E712
        )
    )
    project_name_by_id = {str(p.id): p.name for p in projects_result.scalars().all()}

    overdue_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.end_time < now,
            Task.status.notin_(["done", "review"]),  # type: ignore[attr-defined]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    overdue_tasks = overdue_result.scalars().all()

    assignee_ids = [t.assignee_id for t in overdue_tasks]
    if assignee_ids:
        users_result = await session.execute(
            select(User).where(User.id.in_(assignee_ids))  # type: ignore[arg-type]
        )
        assignee_name_by_id = {
            str(u.id): (u.full_name or u.email or str(u.id))
            for u in users_result.scalars().all()
        }
    else:
        assignee_name_by_id = {}

    local: list[dict] = []
    critical: list[dict] = []

    for t in overdue_tasks:
        parent = await session.get(Task, t.parent_id) if t.parent_id else None
        cs = compute_task_status(t, parent)
        item = {
            "task_id": str(t.id),
            "name": t.name,
            "assignee_id": str(t.assignee_id),
            "assignee_name": assignee_name_by_id.get(str(t.assignee_id), str(t.assignee_id)),
            "end_time": t.end_time.isoformat(),
            "project_id": str(t.project_id),
            "project_name": project_name_by_id.get(str(t.project_id), str(t.project_id)),
            "is_on_critical_path": t.is_on_critical_path,
        }
        if cs == "overdue_critical":
            critical.append(item)
        else:
            local.append(item)

    return {"overdue_critical": critical, "overdue_local": local}


@router.get("/tasks/calendar")
async def task_calendar(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Task density per day (for calendar heatmap view)."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []

    rows_result = await session.execute(
        select(
            func.date(Task.end_time).label("due_date"),
            func.count(Task.id).label("count"),
        )
        .where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        )
        .group_by(func.date(Task.end_time))
        .order_by(func.date(Task.end_time))
    )
    rows = rows_result.all()
    return [{"date": str(row.due_date), "count": row.count} for row in rows]
