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
from app.models.customer_company import CustomerCompany
from app.models.incident import Incident
from app.models.org import Department
from app.models.project import Project
from app.models.task import Task, TaskAssignee, TaskDependency, TaskProgressReport
from app.models.user import User
from app.services import workload as _wl
from app.services.province_coords import coords_for_province
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


# --- Cân bằng tải (workload) — Bước 2, Cách A. Logic thuần ở app.services.workload ---
STANDARD_SHIFT_HOURS = _wl.STANDARD_SHIFT_HOURS
DEFAULT_TASK_HOURS = _wl.DEFAULT_TASK_HOURS
FREE_THRESHOLD = _wl.FREE_THRESHOLD
OVERLOAD_THRESHOLD = _wl.OVERLOAD_THRESHOLD
_business_days = _wl.business_days
_load_status = _wl.load_status
_load_recommendation = _wl.load_recommendation


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


async def _open_task_assignee_hours(
    session: AsyncSession, project_ids: list[uuid.UUID]
) -> dict[str, float]:
    """Tổng giờ ước tính task CHƯA XONG theo từng người phụ trách (assignee chính)."""
    result = await session.execute(
        select(Task.assignee_id, Task.estimated_hours).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status != "done",
            Task.is_deleted == False,  # noqa: E712
        )
    )
    hours: dict[str, float] = {}
    for assignee_id, est in result.all():
        uid = str(assignee_id)
        hours[uid] = hours.get(uid, 0.0) + (est if est is not None else DEFAULT_TASK_HOURS)
    return hours


@router.get("/staffing-summary")
async def staffing_summary(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> dict[str, int]:
    """Đếm nhanh cho Tổng quan: rảnh / được giao / quá tải / việc thiếu người / sự cố mở."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    today = _utcnow().date()
    first = date(today.year, today.month, 1)
    last = date(today.year + (today.month // 12), (today.month % 12) + 1, 1)
    capacity = _business_days(first, last) * STANDARD_SHIFT_HOURS

    alloc = await _open_task_assignee_hours(session, project_ids) if project_ids else {}

    # Tất cả nhân sự đang hoạt động trong công ty (mẫu số cho "rảnh").
    users_stmt = select(User.id).where(
        User.company_id == current_user.company_id,
        User.is_active == True,  # noqa: E712
    )
    if department_id is not None:
        users_stmt = users_stmt.where(User.department_id == department_id)
    all_uids = {str(uid) for uid in (await session.execute(users_stmt)).scalars().all()}

    free = assigned = overloaded = 0
    for uid in all_uids:
        pct = (alloc.get(uid, 0.0) / capacity * 100) if capacity > 0 else 0.0
        if alloc.get(uid, 0.0) > 0:
            assigned += 1
        if pct > OVERLOAD_THRESHOLD:
            overloaded += 1
        elif pct < FREE_THRESHOLD:
            free += 1

    # Việc thiếu người (open, required_headcount > số người đã gán).
    understaffed = 0
    if project_ids:
        understaffed = await _count_understaffed(session, project_ids)

    open_incidents = 0
    if project_ids:
        open_incidents = (await session.execute(
            select(func.count(Incident.id)).where(
                Incident.project_id.in_(project_ids),  # type: ignore[arg-type]
                Incident.status.notin_(["resolved", "closed"]),  # type: ignore[attr-defined]
            )
        )).scalar_one()

    return {
        "free": free,
        "assigned": assigned,
        "overloaded": overloaded,
        "understaffed_tasks": understaffed,
        "open_incidents": int(open_incidents),
    }


async def _count_understaffed(session: AsyncSession, project_ids: list[uuid.UUID]) -> int:
    tasks = await _understaffed_task_rows(session, project_ids)
    return len(tasks)


async def _understaffed_task_rows(
    session: AsyncSession, project_ids: list[uuid.UUID]
) -> list[dict]:
    """Task đang mở mà required_headcount > số người đã gán (1 chính + phụ)."""
    result = await session.execute(
        select(Task).where(
            Task.project_id.in_(project_ids),  # type: ignore[arg-type]
            Task.status != "done",
            Task.is_deleted == False,  # noqa: E712
            Task.required_headcount > 1,
        )
    )
    tasks = result.scalars().all()
    if not tasks:
        return []
    task_ids = [t.id for t in tasks]
    extra_result = await session.execute(
        select(TaskAssignee.task_id, func.count(TaskAssignee.id))
        .where(TaskAssignee.task_id.in_(task_ids))  # type: ignore[arg-type]
        .group_by(TaskAssignee.task_id)
    )
    extra_by_task = {row[0]: int(row[1]) for row in extra_result.all()}
    out: list[dict] = []
    for t in tasks:
        assigned_n = 1 + extra_by_task.get(t.id, 0)
        shortage = t.required_headcount - assigned_n
        if shortage > 0:
            out.append(
                {
                    "task_id": str(t.id),
                    "name": t.name,
                    "project_id": str(t.project_id),
                    "required": t.required_headcount,
                    "assigned": assigned_n,
                    "shortage": shortage,
                }
            )
    return out


@router.get("/understaffed-tasks")
async def understaffed_tasks(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    project_id: uuid.UUID | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
) -> list[dict]:
    """Danh sách task đang thiếu người (để nút 'Bố trí ngay')."""
    project_ids = await _project_ids_scope(session, current_user, project_id, department_id)
    if not project_ids:
        return []
    return await _understaffed_task_rows(session, project_ids)


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
    # The UI sends ISO strings with a Z offset, but start_time/end_time are
    # TIMESTAMP WITHOUT TIME ZONE — binding an aware datetime makes asyncpg raise
    # DataError, which surfaced as "Không tải được Gantt".
    start_naive = _naive_utc(start_date)
    end_naive = _naive_utc(end_date)
    if start_naive is not None:
        stmt = stmt.where(Task.end_time >= start_naive)
    if end_naive is not None:
        stmt = stmt.where(Task.start_time <= end_naive)
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
            # kpi_weight: ngày công thực tế (Σ weight, mỗi ngày max 1.0)
            func.coalesce(func.sum(AttendanceRecord.kpi_weight), 0.0).label("kpi_days"),
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
            "kpi_days": round(float(row.kpi_days or 0.0), 2),
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
        s = task_stats.setdefault(
            uid, {"total": 0, "done": 0, "overdue": 0, "allocated_hours": 0.0}
        )
        s["total"] += 1
        end_time = _naive_utc(t.end_time)
        if t.status == "done":
            s["done"] += 1
        else:
            # Giờ đã phân công (tử số tải trọng) = tổng giờ ước tính task chưa xong.
            s["allocated_hours"] += (
                t.estimated_hours if t.estimated_hours is not None else DEFAULT_TASK_HOURS
            )
            if end_time and end_time < now:
                s["overdue"] += 1

    # Giờ khả dụng (Cách A): số ngày công chuẩn trong kỳ × ca 8h.
    capacity_hours = round(_business_days(first, last) * STANDARD_SHIFT_HOURS, 1)

    # --- Merge + resolve user names ---
    all_uids = set(att_by_user) | set(task_stats)
    all_uids.discard("None")
    uuid_ids = [uuid.UUID(u) for u in all_uids]
    users_by_id: dict[str, User] = {}
    dept_name_by_id: dict[uuid.UUID, str] = {}
    if uuid_ids:
        ures = await session.execute(
            select(User).where(User.id.in_(uuid_ids))  # type: ignore[arg-type]
        )
        users_by_id = {str(u.id): u for u in ures.scalars().all()}
        dept_ids = {u.department_id for u in users_by_id.values() if u.department_id}
        if dept_ids:
            dres = await session.execute(
                select(Department.id, Department.name).where(
                    Department.id.in_(dept_ids)  # type: ignore[arg-type]
                )
            )
            dept_name_by_id = {row[0]: row[1] for row in dres.all()}

    rows = []
    for uid in all_uids:
        att = att_by_user.get(uid, {})
        ts = task_stats.get(uid, {"total": 0, "done": 0, "overdue": 0, "allocated_hours": 0.0})
        u = users_by_id.get(uid)
        hours = att.get("work_hours", 0.0)
        done = ts["done"]
        allocated = round(ts.get("allocated_hours", 0.0), 1)
        workload_pct = (
            round(allocated / capacity_hours * 100, 1) if capacity_hours > 0 else 0.0
        )
        rows.append(
            {
                "user_id": uid,
                "user_name": (u.full_name or u.email) if u else uid,
                "department_name": (
                    dept_name_by_id.get(u.department_id) if u and u.department_id else None
                ),
                "work_hours": hours,
                "days_worked": att.get("days_worked", 0),
                "kpi_days": att.get("kpi_days", 0.0),
                "tasks_total": ts["total"],
                "tasks_done": done,
                "tasks_overdue": ts["overdue"],
                "completion_pct": round(done / ts["total"] * 100, 1)
                if ts["total"]
                else 0.0,
                # Output per work-hour — simple efficiency proxy.
                "tasks_per_hour": round(done / hours, 3) if hours > 0 else None,
                # --- Cân bằng tải (Bước 2, Cách A) ---
                "capacity_hours": capacity_hours,
                "allocated_hours": allocated,
                "workload_pct": workload_pct,
                "load_status": _load_status(workload_pct),
                "recommendation": _load_recommendation(workload_pct),
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


# ---------------------------------------------------------------------------
# Map overview endpoint (Bước 9 — Gap 49–56)
# ---------------------------------------------------------------------------

@router.get("/map")
async def map_overview(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID | None = None,
) -> dict:
    """Trả dữ liệu cho Sơ đồ vị trí: sites, customers, staff với vị trí suy luận.

    Thứ tự suy luận vị trí NV:
      1. Task đang in_progress → Project.site_lat/lng
      2. GPS check-in AttendanceRecord gần nhất (work_date hôm nay)
      3. Fallback: toạ độ trung tâm quốc gia (chưa có province trên User)

    Superuser có thể pass ?company_id= để xem công ty khác.
    """
    if company_id and current_user.is_superuser:
        pass  # dùng company_id từ query param
    else:
        company_id = current_user.company_id

    # 1. Sites — projects của công ty có toạ độ
    proj_result = await session.execute(
        select(Project).where(
            Project.company_id == company_id,
            Project.is_deleted == False,  # noqa: E712
            Project.status.not_in(["completed", "cancelled"]),  # type: ignore[union-attr]
        )
    )
    projects = proj_result.scalars().all()

    # Progress per project (avg of done tasks)
    proj_ids = [p.id for p in projects]
    sites = []
    for p in projects:
        sites.append({
            "project_id": str(p.id),
            "name": p.name,
            "lat": p.site_lat,
            "lng": p.site_lng,
            "status": p.status,
            "priority": p.priority,
            "progress_pct": 0,  # filled below
            "staff_count": 0,
        })

    # Task progress per project
    if proj_ids:
        task_q = await session.execute(
            select(
                Task.project_id,
                func.count(Task.id).label("total"),
                func.sum(
                    cast(Task.status == "done", Integer)
                ).label("done"),
            )
            .where(
                Task.project_id.in_(proj_ids),  # type: ignore[arg-type]
                Task.is_deleted == False,  # noqa: E712
            )
            .group_by(Task.project_id)
        )
        for row in task_q.all():
            total = row.total or 0
            done = int(row.done or 0)
            pct = round(done / total * 100) if total else 0
            for s in sites:
                if s["project_id"] == str(row.project_id):
                    s["progress_pct"] = pct

        # Staff count per project (today's attendances)
        from datetime import date as _date
        today = _date.today()
        att_q = await session.execute(
            select(
                AttendanceRecord.project_id,
                func.count(func.distinct(AttendanceRecord.user_id)).label("cnt"),
            )
            .where(
                AttendanceRecord.project_id.in_(proj_ids),  # type: ignore[arg-type]
                AttendanceRecord.work_date == today,
            )
            .group_by(AttendanceRecord.project_id)
        )
        for row in att_q.all():
            for s in sites:
                if s["project_id"] == str(row.project_id):
                    s["staff_count"] = int(row.cnt or 0)

    # 2. Customers with coords
    cust_result = await session.execute(
        select(CustomerCompany).where(
            CustomerCompany.company_id == company_id,
            CustomerCompany.site_lat != None,  # noqa: E711
        )
    )
    customers = [
        {
            "id": str(c.id),
            "name": c.name,
            "lat": c.site_lat,
            "lng": c.site_lng,
            "phone": c.contact_phone,
            "address": c.address,
        }
        for c in cust_result.scalars().all()
    ]

    # 3. Staff location inference
    # active members of company
    user_result = await session.execute(
        select(User).where(
            User.company_id == company_id,
            User.is_active == True,  # noqa: E712
        )
    )
    users = user_result.scalars().all()

    # Map project_id → (lat, lng) for quick lookup
    proj_coords: dict[str, tuple[float, float]] = {
        str(p.id): (p.site_lat, p.site_lng)
        for p in projects
        if p.site_lat and p.site_lng
    }

    # Task in_progress per user → project coords
    active_task_q = await session.execute(
        select(Task.assignee_id, Task.project_id)
        .where(
            Task.project_id.in_(proj_ids),  # type: ignore[arg-type]
            Task.status == "in_progress",
            Task.is_deleted == False,  # noqa: E712
            Task.assignee_id != None,  # noqa: E711
        )
    )
    user_active_proj: dict[str, str] = {}
    for row in active_task_q.all():
        user_active_proj[str(row.assignee_id)] = str(row.project_id)

    # Cũng include extra assignees từ TaskAssignee table
    extra_assignee_q = await session.execute(
        select(TaskAssignee.user_id, Task.project_id)
        .join(Task, TaskAssignee.task_id == Task.id)
        .where(
            Task.project_id.in_(proj_ids),  # type: ignore[arg-type]
            Task.status == "in_progress",
            Task.is_deleted == False,  # noqa: E712
        )
    )
    for row in extra_assignee_q.all():
        uid = str(row.user_id)
        if uid not in user_active_proj:
            user_active_proj[uid] = str(row.project_id)

    # Today's attendance GPS per user
    from datetime import date as _date2
    today2 = _date2.today()
    today_att_q = await session.execute(
        select(AttendanceRecord.user_id, AttendanceRecord.check_in_lat, AttendanceRecord.check_in_lng)
        .where(
            AttendanceRecord.company_id == company_id,
            AttendanceRecord.work_date == today2,
            AttendanceRecord.check_in_lat != None,  # noqa: E711
        )
        .order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
    )
    user_att_gps: dict[str, tuple[float, float]] = {}
    for row in today_att_q.all():
        uid = str(row.user_id)
        if uid not in user_att_gps:
            user_att_gps[uid] = (row.check_in_lat, row.check_in_lng)

    staff = []
    fallback_lat, fallback_lng = coords_for_province(None)
    for u in users:
        uid = str(u.id)
        # Determine status
        if uid in user_active_proj:
            status = "working"
        elif uid in user_att_gps:
            status = "working"
        else:
            status = "free"

        # Infer location
        loc_source = "province"
        lat, lng = fallback_lat, fallback_lng

        if uid in user_active_proj:
            pcoords = proj_coords.get(user_active_proj[uid])
            if pcoords:
                lat, lng = pcoords
                loc_source = "task"
        elif uid in user_att_gps:
            lat, lng = user_att_gps[uid]
            loc_source = "attendance"

        staff.append({
            "user_id": uid,
            "name": u.full_name or u.email,
            "status": status,
            "lat": lat,
            "lng": lng,
            "loc_source": loc_source,
        })

    return {"sites": sites, "customers": customers, "staff": staff}
