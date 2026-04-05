"""
Task business logic service.
Handles:
  - Timeline validation (conflict detection)
  - Overdue status computation (on-read, not stored)
  - Cascade delay propagation (event-driven)
  - Critical path cache invalidation trigger
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.task import Task, TaskDependency, TaskProgressReport, TaskPublic
from app.shared.audit import write_audit_log


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Computed status (on-read — never stored in DB)
# ---------------------------------------------------------------------------

def compute_task_status(task: Task, parent: Task | None = None) -> str:
    """
    Returns a display status that includes computed overdue variants.
    This is ONLY used when building response payloads — never written to DB.

    Status priority (highest → lowest):
      done          — always done
      overdue_critical — past deadline AND (on critical path OR parent also overdue)
      overdue_local — past deadline BUT parent still has time (warning only)
      due_soon      — deadline within 24h
      review        — submitted, waiting approval
      in_progress   — actively being worked on
      todo          — not started yet
    """
    now = utcnow()
    stored = task.status

    if stored == "done":
        return "done"
    if stored == "review":
        return "review"

    is_past_deadline = task.end_time.replace(tzinfo=timezone.utc) < now

    if is_past_deadline:
        if task.is_on_critical_path:
            return "overdue_critical"
        if parent is not None:
            parent_end = parent.end_time.replace(tzinfo=timezone.utc)
            if parent_end >= now:
                # Sub-task late BUT parent still has room → local warning
                return "overdue_local"
            else:
                return "overdue_critical"
        # Head task (no parent) → always critical
        return "overdue_critical"

    # Not past deadline yet
    due_soon_threshold = now + timedelta(hours=24)
    if task.end_time.replace(tzinfo=timezone.utc) <= due_soon_threshold:
        return "due_soon"

    return stored  # "todo" or "in_progress"


def raw_sum_progress_reports(session: Session, task_id: uuid.UUID) -> int:
    """Sum all submitted progress_percent values for a task (not capped)."""
    raw = session.exec(
        select(func.coalesce(func.sum(TaskProgressReport.progress_percent), 0)).where(
            TaskProgressReport.task_id == task_id
        )
    ).first()
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def enrich_task_public(task: Task, session: Session) -> TaskPublic:
    """Build a TaskPublic with computed_status and cumulative progress filled in."""
    parent = session.get(Task, task.parent_id) if task.parent_id else None
    computed = compute_task_status(task, parent)
    cumulative = raw_sum_progress_reports(session, task.id)
    return TaskPublic(
        **task.model_dump(),
        computed_status=computed,
        reported_progress_total=min(100, cumulative),
    )


# ---------------------------------------------------------------------------
# Timeline validation
# ---------------------------------------------------------------------------

class TimelineConflict(Exception):
    def __init__(self, message: str, conflicts: list[dict] | None = None):
        super().__init__(message)
        self.conflicts = conflicts or []


def validate_task_timeline(
    session: Session,
    task_data: dict,
    task_id: uuid.UUID | None = None,  # None when creating new
    parent_id: uuid.UUID | None = None,
) -> list[dict]:
    """
    Validates timeline for a new or updated task.
    Returns list of soft conflict warnings (overlapping assignee schedule).
    Raises TimelineConflict for hard violations.
    """
    start: datetime = task_data["start_time"]
    end: datetime = task_data["end_time"]
    assignee_id: uuid.UUID = task_data.get("assignee_id")

    # --- Hard rule 1: start must be before end ---
    if start >= end:
        raise TimelineConflict("start_time phải trước end_time")

    # --- Hard rule 2: must fit within parent's timeline ---
    if parent_id:
        parent = session.get(Task, parent_id)
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

    # --- Soft warning: assignee has overlapping tasks ---
    soft_conflicts: list[dict] = []
    if assignee_id:
        q = select(Task).where(
            Task.assignee_id == assignee_id,
            Task.is_deleted == False,  # noqa: E712
            Task.start_time < end,
            Task.end_time > start,
            Task.status.notin_(["done"]),  # type: ignore[attr-defined]
        )
        if task_id:
            q = q.where(Task.id != task_id)
        overlapping = session.exec(q).all()
        soft_conflicts = [
            {"task_id": str(t.id), "name": t.name, "end_time": t.end_time.isoformat()}
            for t in overlapping
        ]

    return soft_conflicts  # Caller decides whether to block or just warn


# ---------------------------------------------------------------------------
# Cascade delay (event-driven — called from background task)
# ---------------------------------------------------------------------------

async def cascade_delay_from(
    session: Session,
    actor_id: uuid.UUID,
    task: Task,
    delay_seconds: int,
    visited: set[uuid.UUID] | None = None,
) -> None:
    """
    Recursively push the timeline of all tasks that depend on `task`.
    Visited set prevents infinite loops in cyclic dependency graphs.
    """
    if visited is None:
        visited = set()
    if task.id in visited:
        return
    visited.add(task.id)

    dependents_links = session.exec(
        select(TaskDependency).where(TaskDependency.blocking_task_id == task.id)
    ).all()

    for link in dependents_links:
        if link.dependency_type != "FS":
            continue
        dep = session.get(Task, link.dependent_task_id)
        if dep is None or dep.status == "done" or dep.id in visited:
            continue

        old_start = dep.start_time
        old_end = dep.end_time
        delta = timedelta(seconds=delay_seconds)

        dep.start_time = dep.start_time + delta
        dep.end_time = dep.end_time + delta
        session.add(dep)

        write_audit_log(
            session=session,
            actor_id=actor_id,
            action="task.cascade_delay",
            entity_type="task",
            entity_id=dep.id,
            old_value={"start": old_start.isoformat(), "end": old_end.isoformat()},
            new_value={"start": dep.start_time.isoformat(), "end": dep.end_time.isoformat()},
        )

        # Recurse downstream
        await cascade_delay_from(session, actor_id, dep, delay_seconds, visited)

    session.commit()
