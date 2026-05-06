"""
Auto-expire pending delay-justification requests.

Runs periodically (hourly). Any delay request that has been PENDING for more
than DELAY_REQUEST_EXPIRY_DAYS days is automatically REJECTED so the task is
not permanently blocked from receiving new extension requests.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.celery_app import celery_app
from app.core.database.engine import sync_engine
from app.models.task import AuditLog, Task, TaskComment

logger = logging.getLogger(__name__)

DELAY_REQUEST_EXPIRY_DAYS = 3


@celery_app.task(name="app.jobs.delay_expiry_job.expire_pending_delay_requests", bind=True, max_retries=2)
def expire_pending_delay_requests(_self) -> dict:
    """
    Find all delay_justification comments that are still PENDING after
    DELAY_REQUEST_EXPIRY_DAYS days and auto-reject them.
    """
    expired_before = datetime.now(timezone.utc) - timedelta(days=DELAY_REQUEST_EXPIRY_DAYS)
    rejected = 0

    with Session(sync_engine) as session:
        pending = session.exec(
            select(TaskComment).where(
                TaskComment.comment_type == "delay_justification",
                TaskComment.approval_status == "PENDING",
                TaskComment.created_at < expired_before,
            )
        ).all()

        for comment in pending:
            task = session.get(Task, comment.task_id)
            task_name = task.name if task else str(comment.task_id)

            comment.approval_status = "REJECTED"
            session.add(comment)

            log = AuditLog(
                actor_id=None,
                action="task.delay_request_auto_rejected",
                entity_type="task",
                entity_id=comment.task_id,
                old_value={"approval_status": "PENDING"},
                new_value={
                    "approval_status": "REJECTED",
                    "reason": f"Auto-rejected after {DELAY_REQUEST_EXPIRY_DAYS} days without review",
                    "comment_id": str(comment.id),
                },
            )
            session.add(log)
            rejected += 1
            logger.info(
                "Auto-rejected delay request %s for task '%s' (created %s)",
                comment.id,
                task_name,
                comment.created_at.isoformat(),
            )

        session.commit()

    return {"auto_rejected": rejected}
