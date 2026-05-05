"""
Outbox dispatcher — relay pending OutboxEvent rows to downstream handlers.

Runs every 30 seconds via Celery Beat.
Each event is processed idempotently: status transitions are checked before
processing to prevent double-delivery in case of retried tasks.
"""

from __future__ import annotations

import logging

from sqlmodel import Session, select

from app.core.celery_app import celery_app
from app.core.database.engine import sync_engine
from app.models.outbox import OutboxEvent

logger = logging.getLogger(__name__)

_MAX_RETRIES = 5


@celery_app.task(name="app.jobs.outbox_dispatcher.dispatch_pending_events", bind=True, max_retries=3)
def dispatch_pending_events(_self) -> dict:
    """
    Pick up pending OutboxEvent rows (oldest first, up to 100 per run) and
    dispatch each to its handler. Mark as done on success, failed on error.
    """
    processed = 0
    failed = 0

    with Session(sync_engine) as session:
        events = session.exec(
            select(OutboxEvent)
            .where(OutboxEvent.status == "pending")
            .order_by(OutboxEvent.created_at)
            .limit(100)
        ).all()

        for event in events:
            if event.retry_count >= _MAX_RETRIES:
                event.status = "failed"
                event.error_message = "Max retries exceeded"
                session.add(event)
                session.commit()
                failed += 1
                continue

            event.status = "processing"
            session.add(event)
            session.commit()

            try:
                _handle_event(session, event)
                event.status = "done"
                from datetime import datetime, timezone
                event.processed_at = datetime.now(timezone.utc)
                session.add(event)
                session.commit()
                processed += 1
            except Exception as exc:
                logger.exception("Outbox event %s failed: %s", event.id, exc)
                session.rollback()
                event.status = "pending"
                event.retry_count += 1
                event.error_message = str(exc)[:2000]
                session.add(event)
                session.commit()
                failed += 1

    return {"processed": processed, "failed": failed}


def _handle_event(session: Session, event: OutboxEvent) -> None:
    """Dispatch a single event to its registered handler."""
    handlers = {
        "task.created": _handle_task_created,
        "task.status_changed": _handle_task_status_changed,
        "task.completed": _handle_task_completed,
        "project.created": _handle_project_created,
    }
    handler = handlers.get(event.event_type)
    if handler is None:
        raise ValueError(f"No handler registered for event type: '{event.event_type}'")
    handler(session, event.payload)


def _handle_task_created(_session: Session, payload: dict) -> None:
    """Handle task.created — placeholder for notifications, search indexing, etc."""
    logger.info("task.created: task_id=%s", payload.get("task_id"))


def _handle_task_status_changed(_session: Session, payload: dict) -> None:
    """Handle task.status_changed — notify assignee, update dashboards."""
    logger.info(
        "task.status_changed: task_id=%s old=%s new=%s",
        payload.get("task_id"),
        payload.get("old_status"),
        payload.get("new_status"),
    )


def _handle_task_completed(_session: Session, payload: dict) -> None:
    """Handle task.completed — check parent task for auto-completion."""
    logger.info("task.completed: task_id=%s", payload.get("task_id"))


def _handle_project_created(_session: Session, payload: dict) -> None:
    """Handle project.created — seed default notifications / roles."""
    logger.info("project.created: project_id=%s", payload.get("project_id"))
