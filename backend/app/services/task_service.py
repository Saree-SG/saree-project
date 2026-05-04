"""
Task service — business logic orchestration for tasks and sub-entities.

All methods are async and accept AsyncSession.
Transaction management is owned by get_async_db (one transaction per request);
services only call flush() via repository helpers.
"""

from __future__ import annotations

import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import (
    AuditLogPublic,
    BlockerInfo,
    DependencyPublic,
    GanttPublic,
    Task,
    TaskAssignee,
    TaskAssigneeAdd,
    TaskAssigneePublic,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCommentPublic,
    TaskCreate,
    TaskDependency,
    TaskDependencyCreate,
    TaskLinkedEntityPublic,
    TaskObserverAdd,
    TaskObserverPublic,
    TaskProgressReport,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskProofCreate,
    TaskProofPublic,
    TaskPublic,
    TaskReassignRequest,
    TasksPublic,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.models.notification import Notification
from app.models.user import User
from app.models.project import Project
from app.repositories.audit_repository import AuditRepository
from app.repositories.outbox_repository import CascadeRepository, OutboxRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.user_repository import UserRepository
from app.shared.permission import has_permission
from app.shared.task_realtime import broadcast_task_event, broadcast_task_user_event

ALLOWED_DEPENDENCY_TYPES = {"FS", "SS", "FF", "SF"}


def _utcnow() -> datetime:
    """Return a naive UTC timestamp (matches DB TIMESTAMP WITHOUT TZ)."""

    return datetime.utcnow()


def _naive_utc(dt: datetime) -> datetime:
    """Normalize datetimes to naive UTC for comparisons and DB binds."""

    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Computed status (on-read — never stored)
# ---------------------------------------------------------------------------

def compute_task_status(task: Task, parent: Task | None = None) -> str:
    """
    Derive display status including computed overdue variants.
    Never written to DB; only used when building response payloads.
    """
    now = _utcnow()
    stored = task.status

    if stored in ("done", "review"):
        return stored

    is_past = _naive_utc(task.end_time) < now
    if is_past:
        if task.is_on_critical_path:
            return "overdue_critical"
        if parent is not None:
            parent_end = _naive_utc(parent.end_time)
            return "overdue_local" if parent_end >= now else "overdue_critical"
        return "overdue_critical"

    due_soon_threshold = now + timedelta(hours=24)
    if _naive_utc(task.end_time) <= due_soon_threshold:
        return "due_soon"

    return stored


def _display_name(user: User | None) -> str | None:
    """Return display name for a user or None."""
    if user is None:
        return None
    return user.full_name or user.email


def _merge_legacy_linked_entity(
    task: Task,
    linked_entities: list[TaskLinkedEntityPublic],
) -> list[TaskLinkedEntityPublic]:
    """Return linked entities including legacy singular linked_entity fields."""
    if task.linked_entity_id is None or task.linked_entity_type is None:
        return linked_entities

    for entity in linked_entities:
        if entity.entity_id == task.linked_entity_id:
            return linked_entities

    legacy_row = TaskLinkedEntityPublic(
        id=uuid.uuid4(),
        task_id=task.id,
        entity_type=task.linked_entity_type,
        entity_id=task.linked_entity_id,
        created_by=task.assignor_id,
        created_at=task.updated_at,
    )
    return [legacy_row, *linked_entities]


# ---------------------------------------------------------------------------
# Timeline validation
# ---------------------------------------------------------------------------

class TimelineConflict(Exception):
    """Raised when a task's timeline has a hard constraint violation."""

    def __init__(self, message: str, conflicts: list[dict] | None = None) -> None:
        """Store optional soft-conflict list alongside the message."""
        super().__init__(message)
        self.conflicts = conflicts or []


async def validate_timeline(
    repo: TaskRepository,
    task_data: dict,
    task_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> list[dict]:
    """
    Validate timeline for create/update.
    Returns soft-conflict warnings list.
    Raises TimelineConflict on hard violations.
    """
    start: datetime = _naive_utc(task_data["start_time"])
    end: datetime = _naive_utc(task_data["end_time"])
    task_data["start_time"] = start
    task_data["end_time"] = end
    assignee_id: uuid.UUID | None = task_data.get("assignee_id")

    if start >= end:
        raise TimelineConflict("start_time phải trước end_time")

    if parent_id:
        parent = await repo.get_by_id(parent_id)
        if parent is None:
            raise TimelineConflict("Parent task không tồn tại")
        p_start = parent.start_time.replace(tzinfo=timezone.utc)
        p_end = parent.end_time.replace(tzinfo=timezone.utc)
        s = start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start
        e = end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end
        if s < p_start:
            raise TimelineConflict(
                f"start_time ({s.date()}) không thể trước task cha ({p_start.date()})"
            )
        if e > p_end:
            raise TimelineConflict(
                f"Deadline ({e.date()}) vượt quá deadline task cha ({p_end.date()})"
            )

    soft_conflicts: list[dict] = []
    if assignee_id:
        overlapping = await repo.list_overlapping_for_assignee(
            assignee_id, start, end, exclude_task_id=task_id
        )
        soft_conflicts = [
            {"task_id": str(t.id), "name": t.name, "end_time": t.end_time.isoformat()}
            for t in overlapping
        ]

    return soft_conflicts


# ---------------------------------------------------------------------------
# Enrichment helpers
# ---------------------------------------------------------------------------

async def _rollup_completion_pct(
    repo: TaskRepository,
    task_id: uuid.UUID,
    cache: dict[uuid.UUID, float] | None = None,
) -> float:
    """
    Compute task completion % (0.0–100.0). Max 2 levels: Task → Subtask.

    Formula (WBS Weighted Progress Aggregation):
        Total_Progress(task) = (Self_Progress × W_report/100)
                             + Σ(subtask_self_progress_i × W_i/100)

    Where:
        - Self_Progress     = sum of direct reports on this task (0–100)
        - W_report          = 100 - Σ(subtask.progress_weight)
        - W_i               = subtask.progress_weight (0 if unset)
        - subtask completion = its own direct reports sum (no deeper recursion)

    Since subtasks cannot have children, their completion is simply sum_progress.
    """
    if cache is not None and task_id in cache:
        return cache[task_id]

    task = await repo.get_by_id(task_id)
    if task is None or task.is_deleted:
        return 0.0

    children = await repo.get_children(task_id)

    if not children:
        # Leaf task (subtask or task with no subtasks): completion = direct reports only
        result = min(100.0, float(await repo.sum_progress(task_id)))
    else:
        # Root task: weighted sum of subtask completions + weighted direct reports
        child_weights_total = 0.0
        child_contribution = 0.0
        for child in children:
            # Subtask completion = its own direct reports, capped at 100
            child_self = min(100.0, float(await repo.sum_progress(child.id)))
            w_i = float(child.progress_weight or 0)
            child_contribution += w_i * child_self / 100.0
            child_weights_total += w_i

        w_report = max(0.0, 100.0 - child_weights_total)
        self_progress = float(await repo.sum_progress(task_id))
        direct_contribution = w_report * self_progress / 100.0

        result = min(100.0, child_contribution + direct_contribution)

    if cache is not None:
        cache[task_id] = result
    return result


async def _enrich(
    task: Task,
    session: AsyncSession,
    *,
    user_lookup: dict[uuid.UUID, User] | None = None,
    rollup_cache: dict[uuid.UUID, float] | None = None,
) -> TaskPublic:
    """Build TaskPublic with computed_status, progress total, display names, extra assignees."""
    repo = TaskRepository(session)
    parent = await repo.get_by_id(task.parent_id) if task.parent_id else None
    computed = compute_task_status(task, parent)
    reported = round(await _rollup_completion_pct(repo, task.id, rollup_cache))

    user_repo = UserRepository(session)
    if user_lookup is not None:
        assignee = user_lookup.get(task.assignee_id)
        assignor = user_lookup.get(task.assignor_id)
    else:
        assignee = await user_repo.get_by_id(task.assignee_id)
        assignor = await user_repo.get_by_id(task.assignor_id)

    waiting_for_links = await repo.list_waiting_for_links(task.id)
    blocked_by: list[BlockerInfo] = []
    if waiting_for_links:
        blocker_ids = [link.blocking_task_id for link in waiting_for_links]
        blocker_map = {t.id: t for t in await repo.list_by_ids(blocker_ids)}
        for link in waiting_for_links:
            blocker = blocker_map.get(link.blocking_task_id)
            if blocker and blocker.status != "done":
                blocked_by.append(BlockerInfo(id=blocker.id, name=blocker.name, status=blocker.status))

    extra_rows = await repo.list_extra_assignees(task.id)
    extra_assignees: list[TaskAssigneePublic] = []
    for row in extra_rows:
        if user_lookup is not None:
            u = user_lookup.get(row.user_id)
        else:
            u = await user_repo.get_by_id(row.user_id)
        extra_assignees.append(
            TaskAssigneePublic(
                id=row.id,
                task_id=row.task_id,
                user_id=row.user_id,
                user_name=_display_name(u),
                assigned_by=row.assigned_by,
                assigned_at=row.assigned_at,
            )
        )

    observer_rows = await repo.list_observers(task.id)
    observers: list[TaskObserverPublic] = []
    for row in observer_rows:
        if user_lookup is not None:
            u = user_lookup.get(row.user_id)
        else:
            u = await user_repo.get_by_id(row.user_id)
        observers.append(
            TaskObserverPublic(
                task_id=row.task_id,
                user_id=row.user_id,
                user_name=_display_name(u),
                added_at=row.added_at,
            )
        )

    linked_entities = await repo.list_task_linked_entities(task.id)
    linked_entities_public = [
        TaskLinkedEntityPublic(
            id=row.id,
            task_id=row.task_id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            created_by=row.created_by,
            created_at=row.created_at,
        )
        for row in linked_entities
    ]
    merged_linked_entities = _merge_legacy_linked_entity(task, linked_entities_public)

    return TaskPublic(
        **task.model_dump(),
        computed_status=computed,
        reported_progress_total=reported,
        assignee_name=_display_name(assignee),
        assignor_name=_display_name(assignor),
        blocked_by=blocked_by,
        extra_assignees=extra_assignees,
        observers=observers,
        linked_entities=merged_linked_entities,
    )


async def enrich_tasks(
    tasks: list[Task], session: AsyncSession
) -> list[TaskPublic]:
    """Batch-enrich tasks with shared user lookup and rollup cache."""
    user_ids: set[uuid.UUID] = set()
    for t in tasks:
        user_ids.add(t.assignee_id)
        user_ids.add(t.assignor_id)

    user_repo = UserRepository(session)
    users = await user_repo.list_by_ids(list(user_ids))
    lookup = {u.id: u for u in users}
    rollup_cache: dict[uuid.UUID, float] = {}
    return [
        await _enrich(t, session, user_lookup=lookup, rollup_cache=rollup_cache)
        for t in tasks
    ]


# ---------------------------------------------------------------------------
# Comment serialization helper
# ---------------------------------------------------------------------------

def _comment_to_public(comment: TaskComment, author: User | None) -> TaskCommentPublic:
    """Serialize a TaskComment with resolved author display name."""
    author_name = _display_name(author)
    return TaskCommentPublic(
        content=comment.content,
        comment_type=comment.comment_type,
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        author_name=author_name,
        created_at=comment.created_at,
        is_edited=comment.is_edited,
        requested_end_time=comment.requested_end_time,
        approval_status=comment.approval_status,
    )


# ---------------------------------------------------------------------------
# Progress report serialization helper
# ---------------------------------------------------------------------------

def _report_to_public(
    row: TaskProgressReport, reporter: User | None
) -> TaskProgressReportPublic:
    """Serialize a TaskProgressReport with reporter display name."""
    return TaskProgressReportPublic(
        id=row.id,
        task_id=row.task_id,
        reporter_id=row.reporter_id,
        reporter_name=_display_name(reporter),
        photo_url=row.photo_url,
        progress_percent=row.progress_percent,
        note=row.note,
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# TaskService — all business operations
# ---------------------------------------------------------------------------

class TaskService:
    """
    Orchestrates task domain business logic.

    Each method:
      - Receives AsyncSession (injected by route via DI)
      - Opens session.begin() for the write scope
      - Calls repositories (never session directly)
      - Returns typed response models
    """

    def __init__(self, session: AsyncSession) -> None:
        """Bind service to an async session."""
        self._session = session
        self._task_repo = TaskRepository(session)
        self._user_repo = UserRepository(session)
        self._audit_repo = AuditRepository(session)
        self._outbox_repo = OutboxRepository(session)
        self._cascade_repo = CascadeRepository(session)

    async def _emit_task_ws(self, task_id: uuid.UUID, event: str, data: dict[str, Any]) -> None:
        """Push a task event to WebSocket subscribers; ignore transport failures."""
        try:
            await broadcast_task_event(str(task_id), event, data)
        except Exception:
            logger.exception("task WebSocket broadcast failed task_id={}", task_id)

    async def _emit_task_user_ws(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        event: str,
        data: dict[str, Any],
    ) -> None:
        """Push a task event to one user-scoped websocket channel."""
        try:
            await broadcast_task_user_event(str(user_id), event, str(task_id), data)
        except Exception:
            logger.exception("task user WebSocket broadcast failed task_id={} user_id={}", task_id, user_id)

    async def _notify(
        self,
        user_id: uuid.UUID,
        notif_type: str,
        title: str,
        entity_type: str,
        entity_id: uuid.UUID,
        body: str | None = None,
    ) -> None:
        """Persist a single in-app notification row; flush within caller's transaction."""
        try:
            notif = Notification(
                user_id=user_id,
                type=notif_type,
                title=title,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            self._session.add(notif)
            await self._session.flush()
        except Exception:
            logger.exception("Failed to persist notification user_id={} type={}", user_id, notif_type)

    async def _notify_task_participants(
        self,
        task: Task,
        event: str,
        data: dict[str, Any],
    ) -> None:
        """Push one task event to assignee and assignor user-scoped channels."""
        targets: set[uuid.UUID] = {task.assignee_id, task.assignor_id}
        for user_id in targets:
            await self._emit_task_user_ws(user_id, task.id, event, data)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create_task(
        self, body: TaskCreate, level: int, current_user: User
    ) -> TaskPublic:
        """Create a task; validate timeline, write audit, enqueue cascade outbox."""
        update_data = body.model_dump()
        try:
            await validate_timeline(
                self._task_repo,
                update_data,
                parent_id=body.parent_id,
            )
        except TimelineConflict as exc:
            raise HTTPException(422, str(exc)) from exc

        task = await self._task_repo.create_task(
            body_data=update_data,
            level=level,
            assignor_id=current_user.id,
        )
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.created",
            entity_type="task",
            entity_id=task.id,
            new_value={"name": task.name, "assignee_id": str(task.assignee_id)},
        )
        await self._outbox_repo.create_event(
            "task.created",
            {"task_id": str(task.id), "project_id": str(task.project_id)},
        )
        actor_name = _display_name(current_user) or "Nhân viên"
        payload = {
            "actor_id": str(current_user.id),
            "actor_name": actor_name,
            "task_name": task.name,
            "message": f'{actor_name} đã giao công việc "{task.name}" cho bạn.',
        }
        await self._emit_task_user_ws(task.assignee_id, task.id, "task.assigned", payload)
        if task.assignee_id != current_user.id:
            await self._notify(
                user_id=task.assignee_id,
                notif_type="task_assigned",
                title=f'Bạn được giao công việc "{task.name}"',
                body=f"Được giao bởi {actor_name}",
                entity_type="task",
                entity_id=task.id,
            )

        return await _enrich(task, self._session)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_task(self, task_id: uuid.UUID) -> TaskPublic:
        """Return enriched task or 404."""
        task = await self._task_repo.get_or_404(task_id)
        return await _enrich(task, self._session)

    async def list_project_tasks(
        self,
        project_id: uuid.UUID,
        parent_id: uuid.UUID | None = None,
        filter_root_only: bool = False,
        assignee_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> TasksPublic:
        """Return paginated tasks for a project."""
        tasks, total = await self._task_repo.list_by_project(
            project_id,
            parent_id=parent_id,
            filter_root_only=filter_root_only,
            assignee_id=assignee_id,
            skip=skip,
            limit=limit,
        )
        return TasksPublic(data=await enrich_tasks(list(tasks), self._session), count=total)

    async def my_dashboard(self, current_user: User) -> dict[str, Any]:
        """Personal task dashboard grouped by computed status.

        Tasks that are open but neither overdue, due-soon, nor dated "today"
        are returned under ``ongoing`` so they are not dropped from the UI.
        """
        all_tasks = list(await self._task_repo.list_assigned_to(current_user.id))

        user_ids: set[uuid.UUID] = set()
        project_ids: set[uuid.UUID] = set()
        for t in all_tasks:
            user_ids.add(t.assignee_id)
            user_ids.add(t.assignor_id)
            project_ids.add(t.project_id)

        from sqlalchemy import select as sa_select

        from app.models.org import Company
        from app.models.project import Project

        users = await self._user_repo.list_by_ids(list(user_ids))
        user_lookup = {u.id: u for u in users}

        proj_result = await self._session.execute(
            sa_select(Project).where(
                Project.id.in_(list(project_ids))  # type: ignore[arg-type]
            )
        )
        projects = proj_result.scalars().all()
        proj_by_id = {p.id: p for p in projects}

        company_ids = {p.company_id for p in projects}
        company_result = await self._session.execute(
            sa_select(Company).where(
                Company.id.in_(list(company_ids))  # type: ignore[arg-type]
            )
        )
        companies = company_result.scalars().all()
        comp_by_id = {c.id: c for c in companies}

        today: list[dict] = []
        due_soon: list[dict] = []
        overdue_local: list[dict] = []
        overdue_critical: list[dict] = []
        ongoing: list[dict] = []
        now = _utcnow()
        rollup_cache: dict[uuid.UUID, int] = {}

        for t in all_tasks:
            enriched = await _enrich(
                t,
                self._session,
                user_lookup=user_lookup,
                rollup_cache=rollup_cache,
            )
            project = proj_by_id.get(t.project_id)
            company = comp_by_id.get(project.company_id) if project else None
            row = {
                "task": enriched.model_dump(mode="json"),
                "project_id": str(t.project_id),
                "project_name": project.name if project else "",
                "company_id": str(project.company_id) if project else "",
                "company_name": company.name if company else "",
            }
            cs = enriched.computed_status
            if cs == "overdue_critical":
                overdue_critical.append(row)
            elif cs == "overdue_local":
                overdue_local.append(row)
            elif cs == "due_soon":
                due_soon.append(row)
            elif t.start_time.date() == now.date() or t.end_time.date() == now.date():
                today.append(row)
            else:
                ongoing.append(row)

        return {
            "overdue_critical": overdue_critical,
            "overdue_local": overdue_local,
            "due_soon": due_soon,
            "today": today,
            "ongoing": ongoing,
            "companies": sorted(
                [{"company_id": str(c.id), "company_name": c.name} for c in companies],
                key=lambda r: r["company_name"].lower(),
            ),
            "projects": sorted(
                [
                    {
                        "project_id": str(p.id),
                        "project_name": p.name,
                        "company_id": str(p.company_id),
                    }
                    for p in projects
                ],
                key=lambda r: r["project_name"].lower(),
            ),
            **await self._material_request_dashboard(current_user),
        }

    async def _material_request_dashboard(self, current_user: User) -> dict:
        try:
            from app.services.material_request_service import MaterialRequestService
            from app.shared.storage import LocalStorage
            from app.core.config import settings as _settings
            storage = LocalStorage(
                base_dir=_settings.MATERIAL_REQUEST_UPLOAD_DIR,
                static_url_segment="material-requests",
            )
            svc = MaterialRequestService(self._session, storage)
            return await svc.get_dashboard_data(current_user)
        except Exception:
            logger.exception("Failed to load material request dashboard data")
            return {"pending_material_reviews": [], "pending_material_approvals": [], "my_material_requests": []}

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update_task(
        self, task_id: uuid.UUID, body: TaskUpdate, current_user: User
    ) -> TaskPublic:
        """Update task fields; re-validate timeline; enqueue cascade if delayed."""
        task = await self._task_repo.get_or_404(task_id)
        old_data = task.model_dump()
        update_data = body.model_dump(exclude_unset=True)

        if "start_time" in update_data or "end_time" in update_data:
            merged = {**old_data, **update_data}
            try:
                await validate_timeline(
                    self._task_repo, merged, task_id=task_id, parent_id=task.parent_id
                )
            except TimelineConflict as exc:
                raise HTTPException(422, str(exc)) from exc

        old_end = task.end_time
        task = await self._task_repo.update_fields(task, update_data)

        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.updated",
            entity_type="task",
            entity_id=task.id,
            old_value=old_data,
            new_value=update_data,
        )

        if "end_time" in update_data and task.end_time > old_end:
            delay_secs = int((task.end_time - old_end).total_seconds())
            await self._cascade_repo.create_request(
                task_id=task.id,
                delay_seconds=delay_secs,
                actor_id=current_user.id,
                policy_stop=True,
            )

        changed_fields = sorted(update_data.keys())
        actor_name = _display_name(current_user) or "Nhân viên"
        await self._emit_task_ws(
            task_id,
            "task.updated",
            {
                "actor_id": str(current_user.id),
                "actor_name": actor_name,
                "task_name": task.name,
                "changed_fields": ",".join(changed_fields),
                "message": f'{actor_name} đã cập nhật thông tin công việc "{task.name}".',
            },
        )
        await self._notify_task_participants(
            task,
            "task.updated",
            {
                "actor_id": str(current_user.id),
                "actor_name": actor_name,
                "task_name": task.name,
                "changed_fields": ",".join(changed_fields),
                "message": f'{actor_name} đã cập nhật thông tin công việc "{task.name}".',
            },
        )

        return await _enrich(task, self._session)

    async def update_task_status(
        self, task_id: uuid.UUID, body: TaskStatusUpdate, current_user: User
    ) -> TaskPublic:
        """Update task status; enforce assignee-only rule; emit outbox event."""
        task = await self._task_repo.get_or_404(task_id)
        old_status = task.status

        is_assignee = await self._task_repo.is_assignee(task_id, current_user.id)
        if not is_assignee and not current_user.is_superuser:
            raise HTTPException(403, "Can only update status of own tasks")

        if body.status in ("in_progress", "done"):
            waiting_links = await self._task_repo.list_waiting_for_links(task_id)
            blockers = []
            for link in waiting_links:
                blocker = await self._task_repo.get_by_id(link.blocking_task_id)
                if blocker and blocker.status != "done":
                    blockers.append(blocker.name)
            if blockers:
                names = ", ".join(f'"{n}"' for n in blockers)
                raise HTTPException(
                    422,
                    f"Công việc đang bị chặn bởi: {names}. Vui lòng hoàn thành các công việc trước đó.",
                )

        if body.status == "done":
            combined_total = await _rollup_completion_pct(self._task_repo, task_id)
            if combined_total < 100:
                raise HTTPException(
                    422,
                    "Không thể hoàn thành khi tổng tiến độ (công việc con + báo cáo trực tiếp) chưa đạt 100%.",
                )

        task = await self._task_repo.set_status(task, body.status)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.status_changed",
            entity_type="task",
            entity_id=task.id,
            old_value=old_status,
            new_value=body.status,
        )
        await self._outbox_repo.create_event(
            "task.status_changed",
            {
                "task_id": str(task.id),
                "old_status": old_status,
                "new_status": body.status,
            },
        )
        if body.status == "done":
            await self._outbox_repo.create_event(
                "task.completed",
                {"task_id": str(task.id), "project_id": str(task.project_id)},
            )

        await self._emit_task_ws(
            task_id,
            "task.status_changed",
            {
                "old_status": old_status,
                "new_status": body.status,
                "actor_id": str(current_user.id),
                "actor_name": _display_name(current_user) or "",
            },
        )
        user_payload = {
            "old_status": old_status,
            "new_status": body.status,
            "actor_id": str(current_user.id),
            "actor_name": _display_name(current_user) or "",
            "task_name": task.name,
        }
        await self._notify_task_participants(task, "task.status_changed", user_payload)
        if body.status == "done" and task.assignor_id != current_user.id:
            actor_name = _display_name(current_user) or "Nhân viên"
            await self._notify(
                user_id=task.assignor_id,
                notif_type="task_done",
                title=f'Công việc "{task.name}" đã hoàn thành',
                body=f"Hoàn thành bởi {actor_name}",
                entity_type="task",
                entity_id=task_id,
            )

        return await _enrich(task, self._session)

    # ------------------------------------------------------------------
    # Extra assignees
    # ------------------------------------------------------------------

    async def add_extra_assignee(
        self, task_id: uuid.UUID, body: TaskAssigneeAdd, current_user: User
    ) -> TaskPublic:
        """Add a co-worker to a task; idempotent if already assigned."""
        task = await self._task_repo.get_or_404(task_id)

        if body.user_id == task.assignee_id:
            raise HTTPException(400, "Người này đã là người phụ trách chính của task.")

        existing = await self._task_repo.get_extra_assignee(task_id, body.user_id)
        if existing:
            raise HTTPException(409, "Người này đã được thêm vào task.")

        user = await self._user_repo.get_by_id(body.user_id)
        if user is None:
            raise HTTPException(404, "User not found")

        await self._task_repo.add_extra_assignee(task_id, body.user_id, current_user.id)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.assignee_added",
            entity_type="task",
            entity_id=task_id,
            new_value={"user_id": str(body.user_id)},
        )

        actor_name = _display_name(current_user) or "Quản lý"
        await self._notify(
            user_id=body.user_id,
            notif_type="task_assigned",
            title=f'Bạn được thêm vào công việc "{task.name}"',
            body=f"Được thêm bởi {actor_name}",
            entity_type="task",
            entity_id=task_id,
        )
        await self._emit_task_user_ws(
            body.user_id,
            task_id,
            "task.assigned",
            {
                "actor_id": str(current_user.id),
                "actor_name": actor_name,
                "task_name": task.name,
                "message": f'{actor_name} đã thêm bạn vào công việc "{task.name}".',
            },
        )
        return await _enrich(task, self._session)

    async def remove_extra_assignee(
        self, task_id: uuid.UUID, user_id: uuid.UUID, current_user: User
    ) -> TaskPublic:
        """Remove a co-worker from a task."""
        task = await self._task_repo.get_or_404(task_id)
        row = await self._task_repo.get_extra_assignee(task_id, user_id)
        if row is None:
            raise HTTPException(404, "Người này không có trong danh sách phụ trách task.")
        await self._task_repo.remove_extra_assignee(row)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.assignee_removed",
            entity_type="task",
            entity_id=task_id,
            new_value={"user_id": str(user_id)},
        )
        return await _enrich(task, self._session)

    # ------------------------------------------------------------------
    # Observers
    # ------------------------------------------------------------------

    async def add_observer(
        self, task_id: uuid.UUID, body: TaskObserverAdd, current_user: User
    ) -> TaskPublic:
        """Add a watch-only observer to a task."""
        task = await self._task_repo.get_or_404(task_id)

        if body.user_id == task.assignee_id:
            raise HTTPException(400, "Người phụ trách chính không thể là observer.")
        extra = await self._task_repo.get_extra_assignee(task_id, body.user_id)
        if extra:
            raise HTTPException(400, "Người này đang là người phụ trách task, không thể là observer.")
        existing = await self._task_repo.get_observer(task_id, body.user_id)
        if existing:
            raise HTTPException(409, "Người này đã là observer của task.")

        user = await self._user_repo.get_by_id(body.user_id)
        if user is None:
            raise HTTPException(404, "User not found")

        await self._task_repo.add_observer(task_id, body.user_id)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.observer_added",
            entity_type="task",
            entity_id=task_id,
            new_value={"user_id": str(body.user_id)},
        )
        actor_name = _display_name(current_user) or "Quản lý"
        await self._notify(
            user_id=body.user_id,
            notif_type="task_observer_added",
            title=f'Bạn được thêm theo dõi công việc "{task.name}"',
            body=f"Thêm bởi {actor_name}",
            entity_type="task",
            entity_id=task_id,
        )
        return await _enrich(task, self._session)

    async def remove_observer(
        self, task_id: uuid.UUID, user_id: uuid.UUID, current_user: User
    ) -> TaskPublic:
        """Remove an observer from a task."""
        task = await self._task_repo.get_or_404(task_id)
        row = await self._task_repo.get_observer(task_id, user_id)
        if row is None:
            raise HTTPException(404, "Người này không trong danh sách observer.")
        await self._task_repo.remove_observer(row)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.observer_removed",
            entity_type="task",
            entity_id=task_id,
            new_value={"user_id": str(user_id)},
        )
        return await _enrich(task, self._session)

    # ------------------------------------------------------------------
    # Reassign primary assignee
    # ------------------------------------------------------------------

    async def reassign_task(
        self, task_id: uuid.UUID, body: TaskReassignRequest, current_user: User
    ) -> TaskPublic:
        """Transfer primary assignee to another user.

        Old assignee is automatically moved to extra_assignees so they retain
        visibility and audit trail. If new assignee was previously an extra
        assignee, that row is removed to avoid duplication.
        """
        task = await self._task_repo.get_or_404(task_id)
        old_assignee_id = task.assignee_id

        if body.new_assignee_id == old_assignee_id:
            raise HTTPException(400, "Người này đã là người phụ trách chính.")

        new_user = await self._user_repo.get_by_id(body.new_assignee_id)
        if new_user is None:
            raise HTTPException(404, "User not found")

        # If new assignee was an extra assignee, remove that row first
        existing_extra = await self._task_repo.get_extra_assignee(task_id, body.new_assignee_id)
        if existing_extra:
            await self._task_repo.remove_extra_assignee(existing_extra)

        # If new assignee was an observer, remove observer role
        existing_obs = await self._task_repo.get_observer(task_id, body.new_assignee_id)
        if existing_obs:
            await self._task_repo.remove_observer(existing_obs)

        # Move old assignee to extra assignees (if not already there)
        old_extra = await self._task_repo.get_extra_assignee(task_id, old_assignee_id)
        if old_extra is None:
            await self._task_repo.add_extra_assignee(task_id, old_assignee_id, current_user.id)

        # Update primary assignee
        task = await self._task_repo.update_fields(task, {"assignee_id": body.new_assignee_id})

        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.reassigned",
            entity_type="task",
            entity_id=task_id,
            old_value={"assignee_id": str(old_assignee_id)},
            new_value={"assignee_id": str(body.new_assignee_id)},
        )

        actor_name = _display_name(current_user) or "Quản lý"
        await self._notify(
            user_id=body.new_assignee_id,
            notif_type="task_assigned",
            title=f'Bạn được giao phụ trách công việc "{task.name}"',
            body=f"Chuyển giao bởi {actor_name}",
            entity_type="task",
            entity_id=task_id,
        )
        await self._emit_task_user_ws(
            body.new_assignee_id,
            task_id,
            "task.assigned",
            {
                "actor_id": str(current_user.id),
                "actor_name": actor_name,
                "task_name": task.name,
                "message": f'{actor_name} đã chuyển giao công việc "{task.name}" cho bạn.',
            },
        )
        return await _enrich(task, self._session)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_task(self, task_id: uuid.UUID, current_user: User) -> None:
        """Soft-delete a task and write audit log — all-or-nothing."""
        task = await self._task_repo.get_or_404(task_id)
        await self._task_repo.soft_delete(task)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.deleted",
            entity_type="task",
            entity_id=task.id,
        )

    # ------------------------------------------------------------------
    # Gantt / Critical Path
    # ------------------------------------------------------------------

    async def get_project_gantt(self, project_id: uuid.UUID) -> GanttPublic:
        """Return all tasks + all dependency links for the Gantt chart view."""
        raw_tasks = list(await self._task_repo.list_all_project_tasks(project_id))
        raw_deps = list(await self._task_repo.list_project_dependencies(project_id))

        enriched = await enrich_tasks(raw_tasks, self._session)
        dep_publics = [
            DependencyPublic(
                id=d.id,
                blocking_task_id=d.blocking_task_id,
                dependent_task_id=d.dependent_task_id,
                dependency_type=d.dependency_type,
                lag_hours=d.lag_hours,
            )
            for d in raw_deps
        ]
        return GanttPublic(tasks=enriched, dependencies=dep_publics)

    async def recalculate_critical_path(self, project_id: uuid.UUID) -> None:
        """
        Recalculate is_on_critical_path for every task in a project.

        Algorithm: CPM backward pass on the scheduled timeline.
        - Earliest Finish (EF) = task.end_time  (taken as-is from DB)
        - Latest Finish (LF):
            - tasks with no FS successors → LF = project end (max EF)
            - tasks with FS successors → LF = min(successor.start_time − lag)
        - Float = LF − EF
        - Critical ↔ Float ≤ 1 h tolerance
        """
        raw_tasks = list(await self._task_repo.list_all_project_tasks(project_id))
        if not raw_tasks:
            return

        task_by_id: dict[uuid.UUID, Task] = {t.id: t for t in raw_tasks}
        task_ids = set(task_by_id.keys())
        raw_deps = list(await self._task_repo.list_project_dependencies(project_id))

        # Only FS dependencies affect the forward/backward pass
        successors: dict[uuid.UUID, list[tuple[uuid.UUID, int]]] = defaultdict(list)
        in_degree: dict[uuid.UUID, int] = {t.id: 0 for t in raw_tasks}

        for dep in raw_deps:
            if dep.dependency_type == "FS":
                successors[dep.blocking_task_id].append(
                    (dep.dependent_task_id, dep.lag_hours)
                )
                in_degree[dep.dependent_task_id] = (
                    in_degree.get(dep.dependent_task_id, 0) + 1
                )

        # Topological sort (Kahn's) to determine processing order for backward pass
        queue: deque[uuid.UUID] = deque(
            [tid for tid, deg in in_degree.items() if deg == 0]
        )
        topo: list[uuid.UUID] = []
        tmp_in = dict(in_degree)
        while queue:
            node = queue.popleft()
            topo.append(node)
            for (succ_id, _) in successors.get(node, []):
                tmp_in[succ_id] -= 1
                if tmp_in[succ_id] == 0:
                    queue.append(succ_id)

        def _naive(dt: datetime) -> datetime:
            """Normalize to naive UTC for comparisons."""
            if dt.tzinfo is None:
                return dt
            return dt.astimezone(timezone.utc).replace(tzinfo=None)

        project_end = max(_naive(t.end_time) for t in raw_tasks)

        # Backward pass: compute LF in reverse topological order
        lf: dict[uuid.UUID, datetime] = {}
        for tid in reversed(topo):
            succs = successors.get(tid, [])
            if not succs:
                lf[tid] = project_end
            else:
                succ_starts = []
                for (succ_id, lag_h) in succs:
                    t = task_by_id.get(succ_id)
                    if t:
                        succ_starts.append(_naive(t.start_time) - timedelta(hours=lag_h))
                lf[tid] = min(succ_starts) if succ_starts else project_end

        # Tasks involved in a cycle (not in topo) → assign project_end
        for tid in task_ids:
            if tid not in lf:
                lf[tid] = project_end

        TOLERANCE = timedelta(hours=1)
        for task in raw_tasks:
            ef = _naive(task.end_time)
            float_time = lf[task.id] - ef
            is_critical = float_time <= TOLERANCE
            if task.is_on_critical_path != is_critical:
                task.is_on_critical_path = is_critical
                self._session.add(task)

        await self._session.flush()

    async def remove_dependency(
        self, task_id: uuid.UUID, dep_id: uuid.UUID, current_user: User
    ) -> None:
        """Delete a dependency link and recalculate critical path."""
        dep = await self._task_repo.get_dependency_by_id(dep_id)
        if dep is None or dep.blocking_task_id != task_id:
            raise HTTPException(404, "Dependency not found")
        task = await self._task_repo.get_or_404(task_id)

        # Authorization: assignor or user with TASK_UPDATE permission
        if task.assignor_id != current_user.id and not current_user.is_superuser:
            if not await has_permission(self._session, current_user, "TASK_UPDATE", task.project_id):
                raise HTTPException(403, "Chỉ người tạo task hoặc quản lý mới được sửa phụ thuộc")
        await self._task_repo.delete_dependency(dep)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.dependency_removed",
            entity_type="task",
            entity_id=task_id,
        )
        await self.recalculate_critical_path(task.project_id)

    # ------------------------------------------------------------------
    # Clone (recursive tree)
    # ------------------------------------------------------------------

    async def clone_task(
        self,
        task_id: uuid.UUID,
        current_user: User,
        new_assignee_id: uuid.UUID | None = None,
    ) -> TaskPublic:
        """Clone a task and its entire subtree."""
        root = await self._task_repo.get_or_404(task_id)
        cloned_root = await self._clone_recursive(root, root.parent_id, current_user, new_assignee_id)
        return await _enrich(cloned_root, self._session)

    async def _clone_recursive(
        self,
        original: Task,
        parent_id: uuid.UUID | None,
        current_user: User,
        new_assignee_id: uuid.UUID | None,
    ) -> Task:
        """Recursively clone a task and its children."""
        cloned = await self._task_repo.create_task(
            body_data={
                "project_id": original.project_id,
                "parent_id": parent_id,
                "name": f"[Clone] {original.name}",
                "description": original.description,
                "priority": original.priority,
                "start_time": original.start_time,
                "end_time": original.end_time,
                "assignee_id": new_assignee_id or original.assignee_id,
            },
            level=original.level,
            assignor_id=current_user.id,
        )
        children = await self._task_repo.get_children(original.id)
        for child in children:
            await self._clone_recursive(child, cloned.id, current_user, new_assignee_id)
        return cloned

    # ------------------------------------------------------------------
    # Comments
    # ------------------------------------------------------------------

    async def add_comment(
        self, task_id: uuid.UUID, body: TaskCommentCreate, current_user: User
    ) -> TaskCommentPublic:
        """Add a task comment; validate delay_justification fields."""
        task = await self._task_repo.get_or_404(task_id)
        if body.comment_type == "delay_justification":
            if task.status == "done":
                raise HTTPException(422, "Cannot request delay for a completed task")
            if task.assignee_id != current_user.id and not current_user.is_superuser:
                raise HTTPException(403, "Only the assignee can request a deadline extension")
            if await self._task_repo.has_pending_delay_request(task_id):
                raise HTTPException(409, "A delay request is already pending for this task")
            if body.requested_end_time is None:
                raise HTTPException(422, "requested_end_time is required for delay_justification")
            req = _naive_utc(body.requested_end_time)
            now = _utcnow()
            if req <= _naive_utc(now):
                raise HTTPException(422, "requested_end_time must be later than the current time")
            if req <= _naive_utc(task.end_time):
                raise HTTPException(
                    422,
                    "requested_end_time must be later than the current task deadline",
                )

        approval_status = body.approval_status
        if body.comment_type == "delay_justification" and approval_status is None:
            approval_status = "PENDING"

        comment = await self._task_repo.create_comment({
            "task_id": task_id,
            "author_id": current_user.id,
            "content": body.content,
            "comment_type": body.comment_type,
            "requested_end_time": body.requested_end_time,
            "approval_status": approval_status,
        })

        if body.comment_type == "delay_justification":
            payload = {
                "actor_id": str(current_user.id),
                "requested_end_time": str(comment.requested_end_time),
                "author_name": _display_name(current_user) or "",
                "reason": body.content,
                "task_name": task.name,
            }
            await self._emit_task_ws(
                task_id,
                "task.delay_requested",
                payload,
            )
            await self._notify_task_participants(task, "task.delay_requested", payload)
            author_name = _display_name(current_user) or "Nhân viên"
            if task.assignor_id != current_user.id:
                await self._notify(
                    user_id=task.assignor_id,
                    notif_type="delay_requested",
                    title=f'Yêu cầu gia hạn từ {author_name} cho "{task.name}"',
                    body=body.content,
                    entity_type="task",
                    entity_id=task_id,
                )
        elif body.comment_type == "general":
            actor_name = _display_name(current_user) or "Nhân viên"
            payload = {
                "actor_id": str(current_user.id),
                "actor_name": actor_name,
                "task_name": task.name,
                "message": (
                    f'{actor_name} đã cập nhật "thảo luận" cho công việc "{task.name}".'
                ),
            }
            await self._emit_task_ws(task_id, "task.discussion_added", payload)
            await self._notify_task_participants(task, "task.discussion_added", payload)
            # Persist bell notification for all participants except the author
            for participant_id in {task.assignee_id, task.assignor_id} - {current_user.id}:
                await self._notify(
                    user_id=participant_id,
                    notif_type="discussion_added",
                    title=f'{actor_name} bình luận trong "{task.name}"',
                    body=body.content[:200] if body.content else None,
                    entity_type="task",
                    entity_id=task_id,
                )

        return _comment_to_public(comment, current_user)

    async def list_comments(self, task_id: uuid.UUID) -> list[TaskCommentPublic]:
        """List task comments with author display names."""
        await self._task_repo.get_or_404(task_id)
        comments = await self._task_repo.list_comments(task_id)
        author_ids = list({c.author_id for c in comments})
        authors = await self._user_repo.list_by_ids(author_ids)
        author_map = {u.id: u for u in authors}
        return [_comment_to_public(c, author_map.get(c.author_id)) for c in comments]

    async def approve_delay(
        self,
        task_id: uuid.UUID,
        comment_id: uuid.UUID,
        body: TaskCommentApprovalUpdate,
        current_user: User,
    ) -> TaskCommentPublic:
        """Approve or reject a delay request; update task deadline if approved."""
        task = await self._task_repo.get_or_404(task_id)
        comment = await self._task_repo.get_comment_or_404(comment_id)
        if comment.task_id != task_id:
            raise HTTPException(404, "Comment not found")
        if comment.comment_type != "delay_justification":
            raise HTTPException(422, "Only delay_justification comments can be approved")
        if comment.requested_end_time is None:
            raise HTTPException(422, "Delay request missing requested_end_time")
        if comment.approval_status != "PENDING":
            raise HTTPException(409, "This delay request has already been reviewed")
        if comment.author_id == current_user.id and not current_user.is_superuser:
            raise HTTPException(
                403,
                "Không thể duyệt hoặc từ chối yêu cầu gia hạn do chính bạn tạo",
            )

        old_comment_status = comment.approval_status
        old_end = _naive_utc(task.end_time)
        new_end = _naive_utc(comment.requested_end_time)
        project = await self._session.get(Project, task.project_id)
        if project is None:
            raise HTTPException(404, "Project not found")

        approver_name = _display_name(current_user) or ""

        if body.approval_status == "APPROVED":
            if new_end.date() > project.end_date + timedelta(days=30):
                raise HTTPException(
                    422,
                    "Vượt quá deadline dự án quá xa, cần Giám đốc xác nhận",
                )
            await self._task_repo.update_fields(task, {"end_time": comment.requested_end_time})
            await self._audit_repo.write(
                actor_id=current_user.id,
                action="task.delay_request_approved",
                entity_type="task",
                entity_id=task.id,
                old_value={"end_time": old_end.isoformat()},
                new_value={"end_time": comment.requested_end_time.isoformat()},
            )
            if new_end > old_end:
                delay_secs = int((new_end - old_end).total_seconds())
                if delay_secs > 0:
                    await self._cascade_repo.create_request(
                        task_id=task.id,
                        delay_seconds=delay_secs,
                        actor_id=current_user.id,
                        policy_stop=True,
                    )
            if task.parent_id:
                parent = await self._task_repo.get_by_id(task.parent_id)
                if parent is not None and not parent.is_deleted:
                    p_old = _naive_utc(parent.end_time)
                    if p_old < new_end:
                        await self._task_repo.update_fields(parent, {"end_time": new_end})
                        await self._audit_repo.write(
                            actor_id=current_user.id,
                            action="task.deadline_cascaded_to_parent",
                            entity_type="task",
                            entity_id=parent.id,
                            old_value={"end_time": str(p_old)},
                            new_value={"end_time": str(new_end)},
                        )
            if project.end_date < new_end.date():
                old_pd = project.end_date
                project.end_date = new_end.date()
                self._session.add(project)
                await self._session.flush()
                await self._audit_repo.write(
                    actor_id=current_user.id,
                    action="project.deadline_extended_by_task_delay",
                    entity_type="project",
                    entity_id=project.id,
                    old_value={"end_date": str(old_pd)},
                    new_value={"end_date": str(project.end_date)},
                )

        comment = await self._task_repo.update_comment(
            comment, {"approval_status": body.approval_status}
        )
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.delay_request_reviewed",
            entity_type="task_comment",
            entity_id=comment.id,
            old_value={"approval_status": old_comment_status},
            new_value={"approval_status": body.approval_status},
        )

        if body.approval_status == "APPROVED":
            payload = {
                "actor_id": str(current_user.id),
                "new_end_time": str(new_end),
                "approver_name": approver_name,
                "task_name": task.name,
            }
            await self._emit_task_ws(
                task_id,
                "task.delay_approved",
                payload,
            )
            await self._notify_task_participants(task, "task.delay_approved", payload)
            if comment.author_id != current_user.id:
                await self._notify(
                    user_id=comment.author_id,
                    notif_type="delay_approved",
                    title=f'Yêu cầu gia hạn của "{task.name}" đã được duyệt',
                    body=f"Deadline mới: {new_end.date()}",
                    entity_type="task",
                    entity_id=task_id,
                )
        else:
            payload = {
                "actor_id": str(current_user.id),
                "reviewer_name": approver_name,
                "reason": comment.content,
                "task_name": task.name,
            }
            await self._emit_task_ws(
                task_id,
                "task.delay_rejected",
                payload,
            )
            await self._notify_task_participants(task, "task.delay_rejected", payload)
            if comment.author_id != current_user.id:
                await self._notify(
                    user_id=comment.author_id,
                    notif_type="delay_rejected",
                    title=f'Yêu cầu gia hạn của "{task.name}" đã bị từ chối',
                    body=comment.content,
                    entity_type="task",
                    entity_id=task_id,
                )

        author = await self._user_repo.get_by_id(comment.author_id)
        return _comment_to_public(comment, author)

    # ------------------------------------------------------------------
    # Proofs
    # ------------------------------------------------------------------

    async def upload_proof(
        self, task_id: uuid.UUID, body: TaskProofCreate, current_user: User
    ) -> TaskProofPublic:
        """Upload proof for task; enforce assignee-only."""
        task = await self._task_repo.get_or_404(task_id)
        if task.assignee_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(403, "Only the assignee can upload proof")

        proof = await self._task_repo.create_proof(
            {"task_id": task_id, "uploader_id": current_user.id, **body.model_dump()}
        )
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.proof_uploaded",
            entity_type="task",
            entity_id=task_id,
            new_value={"file_url": body.file_url},
        )

        payload = {
            "actor_id": str(current_user.id),
            "uploader_name": _display_name(current_user) or "",
            "task_name": task.name,
        }
        await self._emit_task_ws(task_id, "task.proof_uploaded", payload)
        await self._notify_task_participants(task, "task.proof_uploaded", payload)
        uploader_name = _display_name(current_user) or "Nhân viên"
        if task.assignor_id != current_user.id:
            await self._notify(
                user_id=task.assignor_id,
                notif_type="proof_uploaded",
                title=f'{uploader_name} đã nộp bằng chứng cho "{task.name}"',
                body="Chờ duyệt bằng chứng",
                entity_type="task",
                entity_id=task_id,
            )

        return TaskProofPublic(**proof.model_dump())

    async def review_proof(
        self,
        task_id: uuid.UUID,
        proof_id: uuid.UUID,
        review_status: str,
        review_note: str | None,
        current_user: User,
    ) -> TaskProofPublic:
        """Approve or reject a proof."""
        proof = await self._task_repo.get_proof_or_404(proof_id, task_id)
        old_status = proof.review_status

        proof = await self._task_repo.update_proof(
            proof,
            {
                "review_status": review_status,
                "reviewer_id": current_user.id,
                "reviewed_at": _utcnow(),
                "review_note": review_note,
            },
        )
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="task.proof_reviewed",
            entity_type="task",
            entity_id=task_id,
            old_value=old_status,
            new_value=review_status,
        )

        reviewer_name = _display_name(current_user) or ""
        task = await self._task_repo.get_or_404(task_id)
        if review_status == "approved":
            payload = {
                "actor_id": str(current_user.id),
                "reviewer_name": reviewer_name,
                "task_name": task.name,
            }
            await self._emit_task_ws(
                task_id,
                "task.proof_approved",
                payload,
            )
            await self._notify_task_participants(task, "task.proof_approved", payload)
            if proof.uploader_id != current_user.id:
                await self._notify(
                    user_id=proof.uploader_id,
                    notif_type="proof_approved",
                    title=f'Bằng chứng của "{task.name}" đã được duyệt',
                    body=f"Duyệt bởi {reviewer_name}",
                    entity_type="task",
                    entity_id=task_id,
                )
        else:
            payload = {
                "actor_id": str(current_user.id),
                "reviewer_name": reviewer_name,
                "note": review_note or "",
                "task_name": task.name,
            }
            await self._emit_task_ws(
                task_id,
                "task.proof_rejected",
                payload,
            )
            await self._notify_task_participants(task, "task.proof_rejected", payload)
            if proof.uploader_id != current_user.id:
                await self._notify(
                    user_id=proof.uploader_id,
                    notif_type="proof_rejected",
                    title=f'Bằng chứng của "{task.name}" bị từ chối',
                    body=review_note or "",
                    entity_type="task",
                    entity_id=task_id,
                )

        return TaskProofPublic(**proof.model_dump())

    async def list_proofs(self, task_id: uuid.UUID) -> list[TaskProofPublic]:
        """List proofs for a task."""
        await self._task_repo.get_or_404(task_id)
        proofs = await self._task_repo.list_proofs(task_id)
        return [TaskProofPublic(**p.model_dump()) for p in proofs]

    # ------------------------------------------------------------------
    # Dependencies
    # ------------------------------------------------------------------

    async def _would_create_cycle(
        self, blocking_id: uuid.UUID, dependent_id: uuid.UUID
    ) -> bool:
        """Return True if adding blocking_id → dependent_id would create a cycle.

        Traverses upward from blocking_id (tasks that block blocking_id)
        to detect if dependent_id is already an ancestor.
        """
        visited: set[uuid.UUID] = set()
        queue: deque[uuid.UUID] = deque([blocking_id])
        while queue:
            node = queue.popleft()
            if node == dependent_id:
                return True
            if node in visited:
                continue
            visited.add(node)
            # Find tasks that `node` itself waits for (its own blockers)
            links = await self._task_repo.list_waiting_for_links(node)
            for link in links:
                queue.append(link.blocking_task_id)
        return False

    async def add_dependency(
        self, task_id: uuid.UUID, body: TaskDependencyCreate, current_user: User
    ) -> dict:
        """Create a dependency link between two tasks."""
        task = await self._task_repo.get_or_404(task_id)

        # Authorization: assignor or user with TASK_UPDATE permission
        if task.assignor_id != current_user.id and not current_user.is_superuser:
            if not await has_permission(self._session, current_user, "TASK_UPDATE", task.project_id):
                raise HTTPException(403, "Chỉ người tạo task hoặc quản lý mới được sửa phụ thuộc")

        if body.dependency_type not in ALLOWED_DEPENDENCY_TYPES:
            raise HTTPException(422, "dependency_type must be one of FS, SS, FF, SF")

        if body.blocking_task_id == body.dependent_task_id:
            raise HTTPException(422, "Task không thể phụ thuộc vào chính nó")

        # Validate both tasks belong to the same project
        blocking_task = await self._task_repo.get_or_404(body.blocking_task_id)
        if blocking_task.project_id != task.project_id:
            raise HTTPException(422, "Không thể tạo phụ thuộc giữa các task khác project")

        existing = await self._task_repo.get_dependency(
            body.blocking_task_id, body.dependent_task_id
        )
        if existing:
            raise HTTPException(409, "Phụ thuộc này đã tồn tại")

        if await self._would_create_cycle(body.blocking_task_id, body.dependent_task_id):
            raise HTTPException(422, "Tạo phụ thuộc này sẽ tạo vòng lặp phụ thuộc")

        await self._task_repo.create_dependency(body.model_dump())
        await self.recalculate_critical_path(task.project_id)

        return {"message": "Dependency added"}

    # ------------------------------------------------------------------
    # Progress reports
    # ------------------------------------------------------------------

    async def add_progress_report(
        self,
        task_id: uuid.UUID,
        body: TaskProgressReportCreate,
        current_user: User,
    ) -> TaskProgressReportPublic:
        """Submit a progress report; auto-transition task status."""
        task = await self._task_repo.get_or_404(task_id)
        if task.status == "done":
            raise HTTPException(422, "Task is already completed")

        photo = body.photo_url.strip()
        if not photo:
            raise HTTPException(422, "photo_url is required")
        if body.progress_percent < 1 or body.progress_percent > 100:
            raise HTTPException(422, "progress_percent must be between 1 and 100")

        # Self-progress (direct reports) is capped independently at 100%
        # W_report weight determines how much this contributes to parent's total
        current_self = await self._task_repo.sum_progress(task_id)
        if current_self >= 100:
            raise HTTPException(422, "Tiến độ trực tiếp đã đạt 100%, không thể thêm báo cáo.")
        max_allowed = 100 - current_self
        if body.progress_percent > max_allowed:
            raise HTTPException(
                422,
                f"Tổng báo cáo trực tiếp không được vượt quá 100%. "
                f"Hiện đang {current_self}%, lần này tối đa {max_allowed}%.",
            )

        report = await self._task_repo.create_progress_report({
            "task_id": task_id,
            "reporter_id": current_user.id,
            "photo_url": photo,
            "progress_percent": body.progress_percent,
            "note": body.note,
        })

        # Auto-transition: use weighted combined total
        combined_after = await _rollup_completion_pct(self._task_repo, task_id)
        if combined_after >= 100.0 and task.status != "done":
            await self._task_repo.set_status(task, "done")
        elif task.status == "todo":
            await self._task_repo.set_status(task, "in_progress")

        actor_name = _display_name(current_user) or "Nhân viên"
        payload = {
            "actor_id": str(current_user.id),
            "actor_name": actor_name,
            "task_name": task.name,
            "progress_percent": str(body.progress_percent),
            "message": (
                f'{actor_name} đã cập nhật "báo cáo tiến độ" cho công việc "{task.name}".'
            ),
        }
        await self._emit_task_ws(task_id, "task.progress_reported", payload)
        await self._notify_task_participants(task, "task.progress_reported", payload)
        # Persist bell notification for assignor (manager sees workers' progress reports)
        if task.assignor_id != current_user.id:
            await self._notify(
                user_id=task.assignor_id,
                notif_type="progress_reported",
                title=f'{actor_name} báo cáo tiến độ +{body.progress_percent}% cho "{task.name}"',
                body=body.note,
                entity_type="task",
                entity_id=task_id,
            )

        return _report_to_public(report, current_user)

    async def list_progress_reports(
        self, task_id: uuid.UUID
    ) -> list[TaskProgressReportPublic]:
        """List progress reports with reporter display names."""
        await self._task_repo.get_or_404(task_id)
        rows = await self._task_repo.list_progress_reports(task_id)
        reporter_ids = list({r.reporter_id for r in rows})
        reporters = await self._user_repo.list_by_ids(reporter_ids)
        by_id = {u.id: u for u in reporters}
        return [_report_to_public(r, by_id.get(r.reporter_id)) for r in rows]

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------

    async def check_conflicts(self, task_id: uuid.UUID) -> dict:
        """Check timeline conflicts for an existing task."""
        task = await self._task_repo.get_or_404(task_id)
        try:
            soft = await validate_timeline(
                self._task_repo,
                task.model_dump(),
                task_id=task.id,
                parent_id=task.parent_id,
            )
        except TimelineConflict as exc:
            return {"has_hard_conflict": True, "detail": str(exc), "soft_conflicts": []}
        return {"has_hard_conflict": False, "soft_conflicts": soft}

    async def get_audit(self, task_id: uuid.UUID) -> list[AuditLogPublic]:
        """Return audit log entries for a task."""
        await self._task_repo.get_or_404(task_id)
        entries = await self._task_repo.list_audit(task_id)
        if not entries:
            return []

        actor_ids = list({e.actor_id for e in entries})
        actors = await self._user_repo.list_by_ids(actor_ids)
        actor_by_id = {u.id: u for u in actors}

        return [
            AuditLogPublic(
                **e.model_dump(),
                actor_name=_display_name(actor_by_id.get(e.actor_id)),
            )
            for e in entries
        ]
