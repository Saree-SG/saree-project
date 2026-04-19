"""
Cascade delay saga — propagate task end_time delay to dependent tasks.

State machine:
  pending → processing → done
                      → stopped  (policy_stop=True + error)
                      → failed   (max retries exceeded)

Algorithm (BFS/DFS on FS dependency graph):
  1. Pick up oldest pending CascadeRequest
  2. For the root task, find all FS-dependent tasks (blocking_task = root)
  3. Shift each dependent task's start/end by delay_seconds
  4. Recursively process dependents of dependents
  5. Write audit log for each shifted task
  6. If any error and policy_stop=True → mark cascade as stopped and exit
  7. Mark cascade as done

Idempotency: CascadeRequest.status = "processing" prevents parallel workers
from picking up the same request. Retry increments retry_count.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.celery_app import celery_app
from app.core.database.engine import sync_engine
from app.models.outbox import CascadeRequest
from app.models.task import AuditLog, Task, TaskDependency

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3


@celery_app.task(name="app.jobs.cascade_job.process_pending_cascades", bind=True, max_retries=3)
def process_pending_cascades(_self) -> dict:
    """Pick up pending cascade requests and process each one sequentially."""
    processed = 0
    failed = 0

    with Session(sync_engine) as session:
        pending = session.exec(
            select(CascadeRequest)
            .where(CascadeRequest.status == "pending")
            .order_by(CascadeRequest.created_at)
            .limit(20)
        ).all()

        for req in pending:
            if req.retry_count >= _MAX_RETRIES:
                req.status = "failed"
                req.error_message = "Max retries exceeded"
                session.add(req)
                session.commit()
                failed += 1
                continue

            req.status = "processing"
            session.add(req)
            session.commit()

            try:
                _run_cascade(session, req)
                req.status = "done"
                req.processed_at = datetime.now(timezone.utc)
                session.add(req)
                session.commit()
                processed += 1
            except _CascadeStopError as exc:
                session.rollback()
                req.status = "stopped"
                req.error_message = str(exc)[:2000]
                session.add(req)
                session.commit()
                failed += 1
            except Exception as exc:
                logger.exception("Cascade %s failed: %s", req.id, exc)
                session.rollback()
                req.status = "pending"
                req.retry_count += 1
                req.error_message = str(exc)[:2000]
                session.add(req)
                session.commit()
                failed += 1

    return {"processed": processed, "failed": failed}


class _CascadeStopError(Exception):
    """Raised when policy_stop=True and a task update fails."""


def _run_cascade(session: Session, req: CascadeRequest) -> None:
    """
    Walk the FS dependency graph from req.task_id (BFS) and shift each
    dependent task's start/end by req.delay_seconds.
    """
    delta = timedelta(seconds=req.delay_seconds)
    visited: set = set()
    queue = [req.task_id]

    while queue:
        current_id = queue.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)

        dependents = session.exec(
            select(TaskDependency).where(
                TaskDependency.blocking_task_id == current_id,
                TaskDependency.dependency_type == "FS",
            )
        ).all()

        for dep in dependents:
            task = session.get(Task, dep.dependent_task_id)
            if task is None or task.is_deleted:
                continue
            if dep.dependent_task_id in visited:
                continue

            try:
                old_start = task.start_time
                old_end = task.end_time
                task.start_time = task.start_time + delta
                task.end_time = task.end_time + delta
                task.updated_at = datetime.now(timezone.utc)
                session.add(task)
                session.flush()

                log = AuditLog(
                    actor_id=req.actor_id,
                    action="task.cascade_delayed",
                    entity_type="task",
                    entity_id=task.id,
                    old_value={
                        "start_time": old_start.isoformat(),
                        "end_time": old_end.isoformat(),
                    },
                    new_value={
                        "start_time": task.start_time.isoformat(),
                        "end_time": task.end_time.isoformat(),
                        "cascade_request_id": str(req.id),
                        "delay_seconds": req.delay_seconds,
                    },
                )
                session.add(log)
                session.flush()

                queue.append(task.id)
            except Exception as exc:
                logger.error(
                    "Cascade: failed to shift task %s: %s", dep.dependent_task_id, exc
                )
                if req.policy_stop:
                    raise _CascadeStopError(
                        f"Failed to shift task {dep.dependent_task_id}: {exc}"
                    ) from exc
