"""
Task service — business logic orchestration for tasks and sub-entities.

All methods are async and accept AsyncSession.
Transaction management is owned by get_async_db (one transaction per request);
services only call flush() via repository helpers.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import (
    AuditLogPublic,
    Task,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCommentPublic,
    TaskCreate,
    TaskDependencyCreate,
    TaskProgressReport,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskProofCreate,
    TaskProofPublic,
    TaskPublic,
    TasksPublic,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.outbox_repository import CascadeRepository, OutboxRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.user_repository import UserRepository

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

async def _enrich(
    task: Task,
    session: AsyncSession,
    *,
    user_lookup: dict[uuid.UUID, User] | None = None,
) -> TaskPublic:
    """Build TaskPublic with computed_status, progress total, and display names."""
    repo = TaskRepository(session)
    parent = await repo.get_by_id(task.parent_id) if task.parent_id else None
    computed = compute_task_status(task, parent)
    cumulative = await repo.sum_progress(task.id)

    if user_lookup is not None:
        assignee = user_lookup.get(task.assignee_id)
        assignor = user_lookup.get(task.assignor_id)
    else:
        user_repo = UserRepository(session)
        assignee = await user_repo.get_by_id(task.assignee_id)
        assignor = await user_repo.get_by_id(task.assignor_id)

    return TaskPublic(
        **task.model_dump(),
        computed_status=computed,
        reported_progress_total=min(100, cumulative),
        assignee_name=_display_name(assignee),
        assignor_name=_display_name(assignor),
    )


async def enrich_tasks(
    tasks: list[Task], session: AsyncSession
) -> list[TaskPublic]:
    """Batch-enrich tasks with shared user lookup to avoid N+1 queries."""
    user_ids: set[uuid.UUID] = set()
    for t in tasks:
        user_ids.add(t.assignee_id)
        user_ids.add(t.assignor_id)

    user_repo = UserRepository(session)
    users = await user_repo.list_by_ids(list(user_ids))
    lookup = {u.id: u for u in users}
    return [await _enrich(t, session, user_lookup=lookup) for t in tasks]


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
        """Personal task dashboard grouped by computed status."""
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
        now = _utcnow()

        for t in all_tasks:
            enriched = await _enrich(t, self._session, user_lookup=user_lookup)
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

        return {
            "overdue_critical": overdue_critical,
            "overdue_local": overdue_local,
            "due_soon": due_soon,
            "today": today,
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
        }

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

        return await _enrich(task, self._session)

    async def update_task_status(
        self, task_id: uuid.UUID, body: TaskStatusUpdate, current_user: User
    ) -> TaskPublic:
        """Update task status; enforce assignee-only rule; emit outbox event."""
        task = await self._task_repo.get_or_404(task_id)
        old_status = task.status

        if task.assignee_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(403, "Can only update status of own tasks")

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
        await self._task_repo.get_or_404(task_id)
        if body.comment_type == "delay_justification" and body.requested_end_time is None:
            raise HTTPException(422, "requested_end_time is required for delay_justification")

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

        old_comment_status = comment.approval_status
        old_end = task.end_time

        if body.approval_status == "APPROVED":
            await self._task_repo.update_fields(
                task, {"end_time": comment.requested_end_time}
            )
            await self._audit_repo.write(
                actor_id=current_user.id,
                action="task.delay_request_approved",
                entity_type="task",
                entity_id=task.id,
                old_value={"end_time": old_end.isoformat()},
                new_value={"end_time": comment.requested_end_time.isoformat()},
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

        return TaskProofPublic(**proof.model_dump())

    async def list_proofs(self, task_id: uuid.UUID) -> list[TaskProofPublic]:
        """List proofs for a task."""
        await self._task_repo.get_or_404(task_id)
        proofs = await self._task_repo.list_proofs(task_id)
        return [TaskProofPublic(**p.model_dump()) for p in proofs]

    # ------------------------------------------------------------------
    # Dependencies
    # ------------------------------------------------------------------

    async def add_dependency(
        self, task_id: uuid.UUID, body: TaskDependencyCreate, current_user: User
    ) -> dict:
        """Create a dependency link between two tasks."""
        if body.dependency_type not in ALLOWED_DEPENDENCY_TYPES:
            raise HTTPException(422, "dependency_type must be one of FS, SS, FF, SF")

        existing = await self._task_repo.get_dependency(
            body.blocking_task_id, body.dependent_task_id
        )
        if existing:
            raise HTTPException(409, "Dependency already exists")
        await self._task_repo.create_dependency(body.model_dump())

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

        current_total = await self._task_repo.sum_progress(task_id)
        if current_total >= 100:
            raise HTTPException(422, "Tiến độ đã đạt 100%, không thể thêm báo cáo.")
        max_allowed = 100 - current_total
        if body.progress_percent > max_allowed:
            raise HTTPException(
                422,
                f"Tổng các lần báo cáo không được vượt quá 100%. "
                f"Hiện đang {current_total}%, lần này tối đa {max_allowed}%.",
            )

        report = await self._task_repo.create_progress_report({
            "task_id": task_id,
            "reporter_id": current_user.id,
            "photo_url": photo,
            "progress_percent": body.progress_percent,
            "note": body.note,
        })

        new_total = await self._task_repo.sum_progress(task_id)
        if new_total >= 100 and task.status != "done":
            await self._task_repo.set_status(task, "done")
        elif body.progress_percent > 0 and task.status == "todo":
            await self._task_repo.set_status(task, "in_progress")

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
        return [AuditLogPublic(**e.model_dump()) for e in entries]
