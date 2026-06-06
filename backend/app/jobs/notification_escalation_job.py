"""
Escalate unread task-assignment notifications to management.

Runs every few minutes. Any `task_assigned` notification that has stayed
UNREAD for more than NOTIFY_ESCALATION_MINUTES minutes is escalated: a new
notification is created for (a) the task creator (assignor) and (b) the
department head of the assignee's department.

Dedup is done via AuditLog: once a notification has been escalated we write an
AuditLog row (entity_type="notification", entity_id=<notification id>,
action="notification.escalated") and skip it on subsequent runs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.core.celery_app import celery_app
from app.core.database.engine import sync_engine
from app.models.notification import Notification
from app.models.org import Department, Role, UserCompanyRole
from app.models.task import AuditLog, Task
from app.models.user import User
from app.services.push_service import send_push_to_user_sync

logger = logging.getLogger(__name__)

NOTIFY_ESCALATION_MINUTES = 30
# Cap per run so a backlog can't block the worker.
MAX_PER_RUN = 100


def _department_head_ids(session: Session, assignee: User) -> list:
    """Return user ids of the department_head(s) of the assignee's department."""
    if assignee.department_id is None or assignee.company_id is None:
        return []
    dept = session.get(Department, assignee.department_id)
    if dept is None:
        return []
    head_role = session.exec(
        select(Role).where(
            Role.company_id == dept.company_id,
            Role.name == "department_head",
        )
    ).first()
    if head_role is None:
        return []
    heads = session.exec(
        select(User.id)
        .join(UserCompanyRole, UserCompanyRole.user_id == User.id)
        .where(
            User.company_id == dept.company_id,
            User.department_id == dept.id,
            UserCompanyRole.role_id == head_role.id,
        )
    ).all()
    return list(heads)


@celery_app.task(
    name="app.jobs.notification_escalation_job.escalate_unread_assignments",
    bind=True,
    max_retries=2,
)
def escalate_unread_assignments(_self) -> dict:
    """Find unread `task_assigned` notifications older than the threshold and
    notify the task creator + the assignee's department head."""
    threshold = datetime.now(timezone.utc) - timedelta(minutes=NOTIFY_ESCALATION_MINUTES)
    escalated = 0
    # (recipient_id, title, body, task_id) collected to push AFTER commit so the
    # network calls don't hold the DB transaction open.
    pending_pushes: list[tuple] = []

    with Session(sync_engine) as session:
        stale = session.exec(
            select(Notification).where(
                Notification.type == "task_assigned",
                Notification.is_read == False,  # noqa: E712
                Notification.created_at < threshold,
            ).limit(MAX_PER_RUN)
        ).all()

        for notif in stale:
            # Dedup: already escalated?
            already = session.exec(
                select(AuditLog).where(
                    AuditLog.entity_type == "notification",
                    AuditLog.entity_id == notif.id,
                    AuditLog.action == "notification.escalated",
                )
            ).first()
            if already is not None:
                continue

            task = session.get(Task, notif.entity_id)
            assignee = session.get(User, notif.user_id)
            if task is None or assignee is None:
                # Mark as handled so we don't re-scan a dangling row forever.
                session.add(
                    AuditLog(
                        actor_id=None,
                        action="notification.escalated",
                        entity_type="notification",
                        entity_id=notif.id,
                        new_value={"skipped": "task_or_assignee_missing"},
                    )
                )
                continue

            recipients = set()
            if task.assignor_id and task.assignor_id != notif.user_id:
                recipients.add(task.assignor_id)
            for head_id in _department_head_ids(session, assignee):
                if head_id != notif.user_id:
                    recipients.add(head_id)

            assignee_name = assignee.full_name or assignee.email
            title = f'"{assignee_name}" chưa đọc thông báo giao việc "{task.name}"'
            body = (
                f"Đã giao {NOTIFY_ESCALATION_MINUTES} phút trước nhưng chưa được đọc."
            )
            for recipient_id in recipients:
                session.add(
                    Notification(
                        user_id=recipient_id,
                        type="task_assignment_unread",
                        title=title,
                        body=body,
                        entity_type="task",
                        entity_id=task.id,
                    )
                )
                pending_pushes.append((recipient_id, title, body, task.id))

            session.add(
                AuditLog(
                    actor_id=None,
                    action="notification.escalated",
                    entity_type="notification",
                    entity_id=notif.id,
                    new_value={
                        "task_id": str(task.id),
                        "assignee_id": str(notif.user_id),
                        "escalated_to": [str(r) for r in recipients],
                    },
                )
            )
            escalated += 1
            logger.info(
                "Escalated unread assignment notif %s (task '%s') to %d recipient(s)",
                notif.id,
                task.name,
                len(recipients),
            )

        session.commit()

        # Fire web push after the row is committed.
        for recipient_id, title, body, task_id in pending_pushes:
            try:
                send_push_to_user_sync(
                    session, recipient_id, title, body, "task", task_id
                )
            except Exception:
                logger.exception("Web push failed for escalation recipient %s", recipient_id)
        session.commit()  # persist any stale-subscription cleanup

    return {"escalated": escalated}
