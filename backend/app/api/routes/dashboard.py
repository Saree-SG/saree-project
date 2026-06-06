"""
Dashboard API — aggregate KPIs across users, projects, tasks.
Full async — no direct DB calls.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.attendance import AttendanceRecord
from app.models.project import Project
from app.models.task import Task, TaskDependency, TaskProgressReport
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
            "code": p.code,
            "end_date": p.end_date.isoformat() if p.end_date else None,
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
    """Project warning report derived from task deadlines."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return {"critical": [], "warning": [], "watch": []}

    now = _utcnow()
    projects_result = await session.execute(
        select(Project).where(
            Project.id.in_(project_ids),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa: E712
        )
    )
    projects = projects_result.scalars().all()
    project_by_id = {str(p.id): p for p in projects}

    tasks_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status.notin_(["done", "review"]),  # type: ignore[attr-defined]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    tasks = tasks_result.scalars().all()

    buckets: dict[str, list[Task]] = {}
    for task in tasks:
        buckets.setdefault(str(task.project_id), []).append(task)

    watch: list[dict] = []
    warning: list[dict] = []
    critical: list[dict] = []

    for project_id_key, project_tasks in buckets.items():
        overdue_tasks = [
            task for task in project_tasks
            if _naive_utc(task.end_time) is not None and _naive_utc(task.end_time) < now
        ]
        due_soon_level2 = []
        due_soon_level3 = []

        for task in project_tasks:
            end_time = _naive_utc(task.end_time)
            if end_time is None or end_time < now:
                continue
            days_left = (end_time - now).total_seconds() / 86400
            if days_left <= 3:
                due_soon_level2.append(task)
            elif days_left <= 7:
                due_soon_level3.append(task)

        severity = None
        focus_tasks: list[Task] = []
        if overdue_tasks:
            severity = "critical"
            focus_tasks = sorted(overdue_tasks, key=lambda task: _naive_utc(task.end_time) or now)
        elif due_soon_level2:
            severity = "warning"
            focus_tasks = sorted(due_soon_level2, key=lambda task: _naive_utc(task.end_time) or now)
        elif due_soon_level3:
            severity = "watch"
            focus_tasks = sorted(due_soon_level3, key=lambda task: _naive_utc(task.end_time) or now)
        else:
            continue

        project = project_by_id.get(project_id_key)
        nearest_task = focus_tasks[0]
        nearest_end = _naive_utc(nearest_task.end_time) or now
        item = {
            "project_id": project_id_key,
            "project_name": project.name if project else project_id_key,
            "project_status": project.status if project else None,
            "severity": severity,
            "overdue_tasks": len(overdue_tasks),
            "warning_tasks": len(due_soon_level2),
            "watch_tasks": len(due_soon_level3),
            "nearest_task_name": nearest_task.name,
            "nearest_task_end_time": nearest_task.end_time.isoformat(),
            "delay_days": max(1, (now.date() - nearest_end.date()).days) if severity == "critical" else 0,
            "days_left": max(0, (nearest_end.date() - now.date()).days) if severity != "critical" else 0,
        }

        if severity == "critical":
            critical.append(item)
        elif severity == "warning":
            warning.append(item)
        else:
            watch.append(item)

    return {
        "critical": critical,
        "warning": warning,
        "watch": watch,
    }


@router.get("/users/{user_id}/tasks")
async def user_tasks(
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[dict]:
    """Tasks assigned to a specific user, for Gantt timeline view on personnel page."""
    project_ids = await _project_ids_scope(session, current_user)
    if not project_ids:
        return []

    tasks_result = await session.execute(
        select(Task).where(
            Task.assignee_id == user_id,
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        ).order_by(Task.start_time)
    )
    tasks = tasks_result.scalars().all()

    project_ids_of_tasks = list({t.project_id for t in tasks})
    project_names: dict[str, str] = {}
    if project_ids_of_tasks:
        proj_result = await session.execute(
            select(Project.id, Project.name).where(Project.id.in_(project_ids_of_tasks))  # type: ignore[arg-type]
        )
        project_names = {str(r.id): r.name for r in proj_result.all()}

    return [
        {
            "id": str(t.id),
            "name": t.name,
            "status": t.status,
            "start_time": t.start_time.isoformat() if t.start_time else None,
            "end_time": t.end_time.isoformat() if t.end_time else None,
            "project_name": project_names.get(str(t.project_id)),
        }
        for t in tasks
    ]


@router.get("/gantt")
async def company_gantt(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
) -> dict[str, Any]:
    """Company-wide Gantt across multiple projects with filters."""
    project_ids = await _project_ids_scope(
        session, current_user, project_id, department_id
    )
    if not project_ids:
        return {"tasks": [], "dependencies": []}

    stmt = select(Task).where(
        Task.project_id.in_(project_ids),  # type: ignore[arg-type]
        Task.is_deleted == False,  # noqa: E712
    )
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if start_date is not None:
        stmt = stmt.where(Task.end_time >= start_date)
    if end_date is not None:
        stmt = stmt.where(Task.start_time <= end_date)
    stmt = stmt.order_by(Task.start_time)
    tasks = (await session.execute(stmt)).scalars().all()
    if not tasks:
        return {"tasks": [], "dependencies": []}

    task_ids = [t.id for t in tasks]
    project_ids_of_tasks = list({t.project_id for t in tasks})
    proj_names = {
        r.id: r.name
        for r in (
            await session.execute(
                select(Project.id, Project.name).where(
                    Project.id.in_(project_ids_of_tasks)  # type: ignore[arg-type]
                )
            )
        ).all()
    }

    assignee_ids = list({t.assignee_id for t in tasks if t.assignee_id})
    user_rows = (
        await session.execute(
            select(User.id, User.full_name, User.email, User.department_id).where(
                User.id.in_(assignee_ids)  # type: ignore[arg-type]
            )
        )
    ).all() if assignee_ids else []
    user_lookup = {
        r.id: {
            "name": r.full_name or r.email,
            "department_id": r.department_id,
        }
        for r in user_rows
    }

    progress_map: dict[uuid.UUID, int] = {}
    try:
        rows = (
            await session.execute(
                select(
                    TaskProgressReport.task_id,
                    func.max(TaskProgressReport.progress_percent),
                )
                .where(TaskProgressReport.task_id.in_(task_ids))  # type: ignore[arg-type]
                .group_by(TaskProgressReport.task_id)
            )
        ).all()
        for tid, pct in rows:
            progress_map[tid] = int(pct or 0)
    except Exception:
        pass

    deps = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.blocking_task_id.in_(task_ids),  # type: ignore[arg-type]
                TaskDependency.dependent_task_id.in_(task_ids),  # type: ignore[arg-type]
            )
        )
    ).scalars().all()

    return {
        "tasks": [
            {
                "id": str(t.id),
                "project_id": str(t.project_id),
                "project_name": proj_names.get(t.project_id),
                "parent_id": str(t.parent_id) if t.parent_id else None,
                "level": t.level,
                "name": t.name,
                "start_time": t.start_time.isoformat() if t.start_time else None,
                "end_time": t.end_time.isoformat() if t.end_time else None,
                "status": t.status,
                "computed_status": compute_task_status(t, None),
                "is_on_critical_path": bool(getattr(t, "is_on_critical_path", False)),
                "reported_progress_total": progress_map.get(t.id, 0),
                "assignee_id": str(t.assignee_id) if t.assignee_id else None,
                "assignee_name": (
                    user_lookup.get(t.assignee_id, {}).get("name")
                    if t.assignee_id
                    else None
                ),
                "assignor_name": None,
            }
            for t in tasks
        ],
        "dependencies": [
            {
                "id": str(d.id),
                "blocking_task_id": str(d.blocking_task_id),
                "dependent_task_id": str(d.dependent_task_id),
                "dependency_type": d.dependency_type,
                "lag_hours": d.lag_hours,
            }
            for d in deps
        ],
    }


@router.get("/users/{user_id}/gantt")
async def user_gantt(
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Gantt view of tasks assigned to a user across all visible projects."""
    project_ids = await _project_ids_scope(session, current_user)
    if not project_ids:
        return {"tasks": [], "dependencies": []}

    tasks = (
        await session.execute(
            select(Task)
            .where(
                Task.assignee_id == user_id,
                Task.project_id.in_(project_ids),  # type: ignore[arg-type]
                Task.is_deleted == False,  # noqa: E712
            )
            .order_by(Task.start_time)
        )
    ).scalars().all()
    if not tasks:
        return {"tasks": [], "dependencies": []}

    task_ids = [t.id for t in tasks]
    project_ids_of_tasks = list({t.project_id for t in tasks})
    proj_names = {
        r.id: r.name
        for r in (
            await session.execute(
                select(Project.id, Project.name).where(
                    Project.id.in_(project_ids_of_tasks)  # type: ignore[arg-type]
                )
            )
        ).all()
    }

    # Progress per task (sum of latest report) — simplified: use reported_progress_total if column exists; fallback 0.
    # Many task rows have it pre-computed.
    progress_map: dict[uuid.UUID, int] = {}
    try:
        rows = (
            await session.execute(
                select(
                    TaskProgressReport.task_id,
                    func.max(TaskProgressReport.progress_percent),
                )
                .where(TaskProgressReport.task_id.in_(task_ids))  # type: ignore[arg-type]
                .group_by(TaskProgressReport.task_id)
            )
        ).all()
        for tid, pct in rows:
            progress_map[tid] = int(pct or 0)
    except Exception:
        pass

    # Dependencies only between user's own tasks
    deps = (
        await session.execute(
            select(TaskDependency).where(
                TaskDependency.blocking_task_id.in_(task_ids),  # type: ignore[arg-type]
                TaskDependency.dependent_task_id.in_(task_ids),  # type: ignore[arg-type]
            )
        )
    ).scalars().all()

    return {
        "tasks": [
            {
                "id": str(t.id),
                "project_id": str(t.project_id),
                "project_name": proj_names.get(t.project_id),
                "parent_id": str(t.parent_id) if t.parent_id else None,
                "level": t.level,
                "name": t.name,
                "start_time": t.start_time.isoformat() if t.start_time else None,
                "end_time": t.end_time.isoformat() if t.end_time else None,
                "status": t.status,
                "computed_status": compute_task_status(t, None),
                "is_on_critical_path": bool(getattr(t, "is_on_critical_path", False)),
                "reported_progress_total": progress_map.get(t.id, 0),
                "assignee_id": str(t.assignee_id) if t.assignee_id else None,
                "assignee_name": None,  # not needed — page already knows the user
                "assignor_name": None,
            }
            for t in tasks
        ],
        "dependencies": [
            {
                "id": str(d.id),
                "blocking_task_id": str(d.blocking_task_id),
                "dependent_task_id": str(d.dependent_task_id),
                "dependency_type": d.dependency_type,
                "lag_hours": d.lag_hours,
            }
            for d in deps
        ],
    }


@router.get("/users/{user_id}/weekly-stats")
async def user_weekly_stats(
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[dict]:
    """Weekly completion/overdue counts for a specific user (last 12 weeks)."""
    from datetime import timedelta

    project_ids = await _project_ids_scope(session, current_user)
    if not project_ids:
        return []

    tasks_result = await session.execute(
        select(Task).where(
            Task.assignee_id == user_id,
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    tasks = tasks_result.scalars().all()

    now = _utcnow()
    weeks: dict[str, dict[str, int]] = {}
    for i in range(11, -1, -1):
        week_start = now - timedelta(weeks=i + 1)
        week_end = now - timedelta(weeks=i)
        label = week_start.strftime("%d/%m")
        weeks[label] = {"done": 0, "overdue": 0, "_start": week_start.timestamp(), "_end": week_end.timestamp()}

    for t in tasks:
        end_time = _naive_utc(t.end_time)
        if end_time is None:
            continue
        for label, bucket in weeks.items():
            if bucket["_start"] <= end_time.timestamp() < bucket["_end"]:
                if t.status == "done":
                    bucket["done"] += 1
                elif end_time < now and t.status not in ("done", "review"):
                    bucket["overdue"] += 1
                break

    return [
        {"period": label, "done": bucket["done"], "overdue": bucket["overdue"]}
        for label, bucket in weeks.items()
    ]


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


def _month_bounds(month: str | None) -> tuple[date, date]:
    """Return (first_day, last_day) for a 'YYYY-MM' string, defaulting to now."""
    today = _utcnow().date()
    if month:
        try:
            y, m = (int(x) for x in month.split("-", 1))
            first = date(y, m, 1)
        except (ValueError, TypeError):
            first = today.replace(day=1)
    else:
        first = today.replace(day=1)
    nxt = date(first.year + (first.month // 12), (first.month % 12) + 1, 1)
    last = date(nxt.year, nxt.month, 1)
    return first, last  # [first, last) — last is exclusive (first of next month)


@router.get("/team-productivity")
async def team_productivity(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    month: str | None = Query(default=None, description="YYYY-MM, default: current"),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict:
    """Per-person productivity for a month: work hours + task completion.

    Combines attendance work hours (giờ công) with task throughput so leaders
    can compare effort vs. output — the basis for thi đua / khen thưởng.
    """
    project_ids = await _project_ids_scope(
        session, current_user, project_id, department_id
    )
    first, last = _month_bounds(month)
    if not project_ids:
        return {"month": first.strftime("%Y-%m"), "rows": []}

    # --- Attendance: work hours + days worked per user ---
    att_result = await session.execute(
        select(
            AttendanceRecord.user_id,
            func.coalesce(func.sum(AttendanceRecord.work_hours), 0.0).label("hours"),
            func.count(func.distinct(AttendanceRecord.work_date)).label("days"),
            func.count(AttendanceRecord.id).label("checkins"),
        )
        .where(
            AttendanceRecord.project_id.in_(project_ids),  # type: ignore[arg-type]
            AttendanceRecord.work_date >= first,
            AttendanceRecord.work_date < last,
        )
        .group_by(AttendanceRecord.user_id)
    )
    att_by_user: dict[str, dict] = {}
    for row in att_result.all():
        att_by_user[str(row.user_id)] = {
            "work_hours": round(float(row.hours or 0.0), 2),
            "days_worked": int(row.days or 0),
            "checkins": int(row.checkins or 0),
        }

    # --- Tasks: completion within month (by actual end / due date) ---
    now = _utcnow()
    tasks_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
        )
    )
    task_stats: dict[str, dict] = {}
    for t in tasks_result.scalars().all():
        uid = str(t.assignee_id)
        s = task_stats.setdefault(uid, {"total": 0, "done": 0, "overdue": 0})
        s["total"] += 1
        end_time = _naive_utc(t.end_time)
        if t.status == "done":
            s["done"] += 1
        elif end_time and end_time < now:
            s["overdue"] += 1

    # --- Merge + resolve user names ---
    all_uids = set(att_by_user) | set(task_stats)
    all_uids.discard("None")
    uuid_ids = [uuid.UUID(u) for u in all_uids]
    users_by_id: dict[str, User] = {}
    if uuid_ids:
        ures = await session.execute(
            select(User).where(User.id.in_(uuid_ids))  # type: ignore[arg-type]
        )
        users_by_id = {str(u.id): u for u in ures.scalars().all()}

    rows = []
    for uid in all_uids:
        att = att_by_user.get(uid, {})
        ts = task_stats.get(uid, {"total": 0, "done": 0, "overdue": 0})
        u = users_by_id.get(uid)
        hours = att.get("work_hours", 0.0)
        done = ts["done"]
        rows.append(
            {
                "user_id": uid,
                "user_name": (u.full_name or u.email) if u else uid,
                "work_hours": hours,
                "days_worked": att.get("days_worked", 0),
                "tasks_total": ts["total"],
                "tasks_done": done,
                "tasks_overdue": ts["overdue"],
                "completion_pct": round(done / ts["total"] * 100, 1)
                if ts["total"]
                else 0.0,
                # Output per work-hour — simple efficiency proxy.
                "tasks_per_hour": round(done / hours, 3) if hours > 0 else None,
            }
        )

    rows.sort(key=lambda r: (r["work_hours"], r["tasks_done"]), reverse=True)
    return {"month": first.strftime("%Y-%m"), "rows": rows}


# Composite score weights for the year-end productivity summary. Sum = 1.0.
# Exposed in the API response so the UI can show the formula transparently.
_YEAR_SCORE_WEIGHTS = {
    "completion": 0.40,   # % công việc hoàn thành
    "on_time": 0.30,      # % hoàn thành đúng hạn
    "attendance": 0.20,   # chuyên cần (ngày công, chuẩn hoá theo người cao nhất)
    "quality": 0.10,      # % bằng chứng được duyệt
}


def _year_bounds(year: int | None, from_month: str | None, to_month: str | None) -> tuple[date, date]:
    """Return [start, end) date range for the summary.

    Defaults to the full calendar year. ``from_month``/``to_month`` ('YYYY-MM')
    override the start/end if provided (end is inclusive of that whole month).
    """
    today = _utcnow().date()
    y = year or today.year
    start = date(y, 1, 1)
    end = date(y + 1, 1, 1)
    if from_month:
        fy, fm = (int(x) for x in from_month.split("-", 1))
        start = date(fy, fm, 1)
    if to_month:
        ty, tm = (int(x) for x in to_month.split("-", 1))
        end = date(ty + (tm // 12), (tm % 12) + 1, 1)
    return start, end


@router.get("/year-summary")
async def year_summary(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    year: int | None = Query(default=None, description="Năm, mặc định năm hiện tại"),
    from_month: str | None = Query(default=None, description="YYYY-MM (ghi đè ngày bắt đầu)"),
    to_month: str | None = Query(default=None, description="YYYY-MM (ghi đè ngày kết thúc)"),
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict:
    """Tổng hợp năng suất cả năm theo nhân sự — cơ sở xét thưởng cuối năm.

    Mỗi người gồm: giờ công + ngày công (chấm công), tỷ lệ hoàn thành & đúng hạn
    (công việc đến hạn trong kỳ), tỷ lệ bằng chứng được duyệt (chất lượng), và
    một ĐIỂM TỔNG HỢP có trọng số để xếp hạng.
    """
    project_ids = await _project_ids_scope(
        session, current_user, project_id, department_id
    )
    start, end = _year_bounds(year, from_month, to_month)
    start_dt = datetime(start.year, start.month, start.day)
    end_dt = datetime(end.year, end.month, end.day)
    label = {
        "year": (year or _utcnow().year),
        "from": start.strftime("%Y-%m"),
        "to": (end - timedelta(days=1)).strftime("%Y-%m"),
        "weights": _YEAR_SCORE_WEIGHTS,
    }
    if not project_ids:
        return {**label, "rows": []}

    now = _utcnow()

    # --- Attendance: giờ công + ngày công trong kỳ ---
    att_result = await session.execute(
        select(
            AttendanceRecord.user_id,
            func.coalesce(func.sum(AttendanceRecord.work_hours), 0.0).label("hours"),
            func.count(func.distinct(AttendanceRecord.work_date)).label("days"),
        )
        .where(
            AttendanceRecord.project_id.in_(project_ids),  # type: ignore[arg-type]
            AttendanceRecord.work_date >= start,
            AttendanceRecord.work_date < end,
        )
        .group_by(AttendanceRecord.user_id)
    )
    att_by_user: dict[str, dict] = {}
    for row in att_result.all():
        att_by_user[str(row.user_id)] = {
            "work_hours": round(float(row.hours or 0.0), 2),
            "days_worked": int(row.days or 0),
        }

    # --- Tasks: tính theo deadline (end_time) rơi vào kỳ ---
    tasks_result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.is_deleted == False,  # noqa: E712
            Task.end_time >= start_dt,
            Task.end_time < end_dt,
        )
    )
    task_stats: dict[str, dict] = {}
    for t in tasks_result.scalars().all():
        uid = str(t.assignee_id)
        s = task_stats.setdefault(
            uid, {"total": 0, "done": 0, "on_time": 0, "overdue": 0}
        )
        s["total"] += 1
        end_time = _naive_utc(t.end_time)
        actual_end = _naive_utc(t.actual_end_time)
        if t.status == "done":
            s["done"] += 1
            if actual_end and end_time and actual_end <= end_time:
                s["on_time"] += 1
        elif end_time and end_time < now:
            s["overdue"] += 1

    # --- Quality: báo cáo tiến độ (ảnh hiện trường) được duyệt / đã review ---
    # The on-site progress photo doubles as completion evidence, so quality is
    # measured from approved vs. reviewed progress reports.
    proof_result = await session.execute(
        select(
            TaskProgressReport.reporter_id,
            func.count(TaskProgressReport.id).label("total"),
            func.sum(
                cast(TaskProgressReport.review_status == "approved", Integer)
            ).label("approved"),
            func.sum(
                cast(
                    TaskProgressReport.review_status.in_(["approved", "rejected"]),
                    Integer,
                )
            ).label("reviewed"),
        )
        .where(
            TaskProgressReport.created_at >= start_dt,
            TaskProgressReport.created_at < end_dt,
        )
        .group_by(TaskProgressReport.reporter_id)
    )
    proof_by_user: dict[str, dict] = {}
    for row in proof_result.all():
        proof_by_user[str(row.reporter_id)] = {
            "proofs_total": int(row.total or 0),
            "proofs_approved": int(row.approved or 0),
            "proofs_reviewed": int(row.reviewed or 0),
        }

    # --- Merge + resolve names ---
    all_uids = set(att_by_user) | set(task_stats) | set(proof_by_user)
    all_uids.discard("None")
    uuid_ids = [uuid.UUID(u) for u in all_uids]
    users_by_id: dict[str, User] = {}
    if uuid_ids:
        ures = await session.execute(
            select(User).where(User.id.in_(uuid_ids))  # type: ignore[arg-type]
        )
        users_by_id = {str(u.id): u for u in ures.scalars().all()}

    max_days = max((a.get("days_worked", 0) for a in att_by_user.values()), default=0)

    rows = []
    for uid in all_uids:
        att = att_by_user.get(uid, {})
        ts = task_stats.get(uid, {"total": 0, "done": 0, "on_time": 0, "overdue": 0})
        pf = proof_by_user.get(uid, {})
        u = users_by_id.get(uid)

        total = ts["total"]
        done = ts["done"]
        days = att.get("days_worked", 0)
        reviewed = pf.get("proofs_reviewed", 0)
        approved = pf.get("proofs_approved", 0)

        completion_pct = round(done / total * 100, 1) if total else 0.0
        on_time_pct = round(ts["on_time"] / done * 100, 1) if done else 0.0
        attendance_pct = round(days / max_days * 100, 1) if max_days else 0.0
        quality_pct = round(approved / reviewed * 100, 1) if reviewed else None

        # Composite score — renormalize weights over the criteria we actually have
        # (quality is skipped when the person has no reviewed proof).
        parts = {
            "completion": completion_pct,
            "on_time": on_time_pct,
            "attendance": attendance_pct,
        }
        if quality_pct is not None:
            parts["quality"] = quality_pct
        wsum = sum(_YEAR_SCORE_WEIGHTS[k] for k in parts)
        score = (
            round(
                sum(parts[k] * _YEAR_SCORE_WEIGHTS[k] for k in parts) / wsum, 1
            )
            if wsum
            else 0.0
        )

        rows.append(
            {
                "user_id": uid,
                "user_name": (u.full_name or u.email) if u else uid,
                "job_title": getattr(u, "job_title", None) if u else None,
                "work_hours": att.get("work_hours", 0.0),
                "days_worked": days,
                "tasks_total": total,
                "tasks_done": done,
                "tasks_on_time": ts["on_time"],
                "tasks_overdue": ts["overdue"],
                "completion_pct": completion_pct,
                "on_time_pct": on_time_pct,
                "attendance_pct": attendance_pct,
                "proofs_total": pf.get("proofs_total", 0),
                "proofs_approved": approved,
                "quality_pct": quality_pct,
                "score": score,
            }
        )

    rows.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return {**label, "rows": rows}
