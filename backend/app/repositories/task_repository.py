"""
Task domain repository — all DB operations for tasks and related sub-entities.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.task import (
    AuditLog,
    Task,
    TaskComment,
    TaskDependency,
    TaskProgressReport,
    TaskProof,
)


def _utcnow_aware() -> datetime:
    """Return timezone-aware UTC (for TIMESTAMP WITH TIME ZONE columns)."""

    return datetime.now(timezone.utc)


def _utcnow_naive() -> datetime:
    """Return naive UTC (for TIMESTAMP WITHOUT TIME ZONE columns)."""

    return datetime.utcnow()


class TaskRepository(BaseRepository[Task]):
    """Async repository for the Task entity and sub-entities."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind repository to the Task model and async session."""
        super().__init__(Task, session)

    # ------------------------------------------------------------------
    # Task fetches
    # ------------------------------------------------------------------

    async def get_or_404(self, task_id: uuid.UUID) -> Task:
        """Load task by PK; raise HTTP 404 if not found or soft-deleted."""
        task = await self.get_by_id(task_id)
        if not task or task.is_deleted:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        parent_id: uuid.UUID | None = None,
        filter_root_only: bool = False,
        assignee_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[Sequence[Task], int]:
        """
        Return paginated tasks for a project with optional filters.
        Returns (items, total_count).
        """
        stmt = select(Task).where(
            Task.project_id == project_id,
            Task.is_deleted == False,  # noqa: E712
        )
        if filter_root_only:
            stmt = stmt.where(Task.parent_id == None)  # noqa: E711
        elif parent_id is not None:
            stmt = stmt.where(Task.parent_id == parent_id)
        if assignee_id is not None:
            stmt = stmt.where(Task.assignee_id == assignee_id)

        count_result = await self._execute(select(func.count()).select_from(stmt.subquery()))
        total: int = count_result.scalar_one()

        result = await self._execute(stmt.offset(skip).limit(limit))
        items: Sequence[Task] = result.scalars().all()
        return items, total

    async def list_assigned_to(self, user_id: uuid.UUID) -> Sequence[Task]:
        """Return all non-done, non-deleted tasks assigned to a user."""
        stmt = select(Task).where(
            Task.assignee_id == user_id,
            Task.is_deleted == False,  # noqa: E712
            Task.status.notin_(["done"]),  # type: ignore[attr-defined]
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def get_children(self, parent_id: uuid.UUID) -> Sequence[Task]:
        """Return direct children of a task that are not soft-deleted."""
        stmt = select(Task).where(
            Task.parent_id == parent_id,
            Task.is_deleted == False,  # noqa: E712
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def list_overlapping_for_assignee(
        self,
        assignee_id: uuid.UUID,
        start: datetime,
        end: datetime,
        exclude_task_id: uuid.UUID | None = None,
    ) -> Sequence[Task]:
        """Return active tasks for assignee overlapping [start, end) for timeline conflict check."""
        stmt = select(Task).where(
            Task.assignee_id == assignee_id,
            Task.is_deleted == False,  # noqa: E712
            Task.start_time < end,
            Task.end_time > start,
            Task.status.notin_(["done"]),  # type: ignore[attr-defined]
        )
        if exclude_task_id is not None:
            stmt = stmt.where(Task.id != exclude_task_id)
        result = await self._execute(stmt)
        return result.scalars().all()

    # ------------------------------------------------------------------
    # Task writes (NO commit — caller/service owns transaction)
    # ------------------------------------------------------------------

    async def create_task(
        self,
        *,
        body_data: dict,
        level: int,
        assignor_id: uuid.UUID,
    ) -> Task:
        """Create a task record; flush so PK is available for audit log."""
        data = {
            **body_data,
            "level": level,
            "assignor_id": assignor_id,
            "status": "todo",
            "is_deleted": False,
        }
        return await self.add(data)

    async def update_fields(self, task: Task, update_data: dict) -> Task:
        """Apply a partial update dict to a task; flush and refresh."""
        for field, val in update_data.items():
            setattr(task, field, val)
        task.updated_at = _utcnow_aware()
        return await self.save(task)

    async def soft_delete(self, task: Task) -> None:
        """Mark task as deleted without removing the row."""
        task.is_deleted = True
        task.deleted_at = _utcnow_naive()
        self._session.add(task)

    async def set_status(self, task: Task, new_status: str) -> Task:
        """Update task status and set actual_end_time when done."""
        task.status = new_status
        if new_status == "done":
            task.actual_end_time = _utcnow_naive()
        task.updated_at = _utcnow_aware()
        return await self.save(task)

    # ------------------------------------------------------------------
    # Sub-entity: progress reports
    # ------------------------------------------------------------------

    async def sum_progress(self, task_id: uuid.UUID) -> int:
        """Sum all submitted progress_percent values for a task (not capped at 100)."""
        stmt = select(func.coalesce(func.sum(TaskProgressReport.progress_percent), 0)).where(
            TaskProgressReport.task_id == task_id
        )
        result = await self._execute(stmt)
        raw = result.scalar_one()
        try:
            return int(raw) if raw is not None else 0
        except (TypeError, ValueError):
            return 0

    async def list_progress_reports(self, task_id: uuid.UUID) -> Sequence[TaskProgressReport]:
        """List progress reports ordered by creation time."""
        stmt = (
            select(TaskProgressReport)
            .where(TaskProgressReport.task_id == task_id)
            .order_by(TaskProgressReport.created_at)
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def create_progress_report(self, data: dict) -> TaskProgressReport:
        """Insert a new progress report; flush to get PK."""
        report = TaskProgressReport.model_validate(data)
        self._session.add(report)
        await self._session.flush()
        await self._session.refresh(report)
        return report

    # ------------------------------------------------------------------
    # Sub-entity: comments
    # ------------------------------------------------------------------

    async def list_comments(self, task_id: uuid.UUID) -> Sequence[TaskComment]:
        """List task comments ordered by creation time."""
        stmt = (
            select(TaskComment)
            .where(TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at)
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def get_comment_or_404(self, comment_id: uuid.UUID) -> TaskComment:
        """Load task comment by PK; raise 404 if not found."""
        comment = await self._session.get(TaskComment, comment_id)
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        return comment

    async def create_comment(self, data: dict) -> TaskComment:
        """Insert a new task comment."""
        comment = TaskComment.model_validate(data)
        self._session.add(comment)
        await self._session.flush()
        await self._session.refresh(comment)
        return comment

    async def update_comment(self, comment: TaskComment, data: dict) -> TaskComment:
        """Apply partial update to a comment."""
        for field, val in data.items():
            setattr(comment, field, val)
        self._session.add(comment)
        await self._session.flush()
        await self._session.refresh(comment)
        return comment

    # ------------------------------------------------------------------
    # Sub-entity: proofs
    # ------------------------------------------------------------------

    async def list_proofs(self, task_id: uuid.UUID) -> Sequence[TaskProof]:
        """List proofs ordered by upload time."""
        stmt = (
            select(TaskProof)
            .where(TaskProof.task_id == task_id)
            .order_by(TaskProof.uploaded_at)
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def get_proof_or_404(self, proof_id: uuid.UUID, task_id: uuid.UUID) -> TaskProof:
        """Load a proof; raise 404 if not found or belongs to another task."""
        proof = await self._session.get(TaskProof, proof_id)
        if not proof or proof.task_id != task_id:
            raise HTTPException(status_code=404, detail="Proof not found")
        return proof

    async def create_proof(self, data: dict) -> TaskProof:
        """Insert a proof record."""
        proof = TaskProof.model_validate(data)
        self._session.add(proof)
        await self._session.flush()
        await self._session.refresh(proof)
        return proof

    async def update_proof(self, proof: TaskProof, data: dict) -> TaskProof:
        """Apply partial update to a proof."""
        for field, val in data.items():
            setattr(proof, field, val)
        self._session.add(proof)
        await self._session.flush()
        await self._session.refresh(proof)
        return proof

    # ------------------------------------------------------------------
    # Sub-entity: dependencies
    # ------------------------------------------------------------------

    async def get_dependency(
        self, blocking_id: uuid.UUID, dependent_id: uuid.UUID
    ) -> TaskDependency | None:
        """Return existing dependency link or None."""
        stmt = select(TaskDependency).where(
            TaskDependency.blocking_task_id == blocking_id,
            TaskDependency.dependent_task_id == dependent_id,
        )
        result = await self._execute(stmt)
        return result.scalars().first()

    async def create_dependency(self, data: dict) -> TaskDependency:
        """Insert a new dependency link."""
        dep = TaskDependency.model_validate(data)
        self._session.add(dep)
        await self._session.flush()
        return dep

    async def list_blocking_links(self, task_id: uuid.UUID) -> Sequence[TaskDependency]:
        """Return all FS dependency links where task_id is the blocking task."""
        stmt = select(TaskDependency).where(
            TaskDependency.blocking_task_id == task_id,
            TaskDependency.dependency_type == "FS",
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    # ------------------------------------------------------------------
    # Sub-entity: audit log
    # ------------------------------------------------------------------

    async def list_audit(self, task_id: uuid.UUID) -> Sequence[AuditLog]:
        """Return audit log entries for a task ordered by creation time."""
        stmt = (
            select(AuditLog)
            .where(AuditLog.entity_type == "task", AuditLog.entity_id == task_id)
            .order_by(AuditLog.created_at)
        )
        result = await self._execute(stmt)
        return result.scalars().all()
