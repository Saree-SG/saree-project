"""
Attendance check-out reminders + auto-mark-absent for forgotten check-outs.

Runs every few minutes. For every still-open attendance record (no check-out):

  * elapsed >= MAX_SHIFT_HOURS (8h) and not yet reminded → push + in-app
    notification asking the worker to check out now. Recorded via
    ``reminder_sent_at`` so we notify only once.
  * elapsed >= ABSENT_AFTER_HOURS (9h) → the day is recorded as absent (vắng):
    the shift is closed with NO hours credited (``apply_auto_close(absent=True)``).
    No notification is sent here — the reminder already warned the worker and we
    intentionally do not surface the exact absent threshold.

``notify_all_open_now`` is a one-shot used at deploy time to nudge EVERY account
that currently has an open shift to check out immediately (see
``deploy_attendance_notice.py``).

Web push mirrors ``notification_escalation_job``: notifications/flags are
committed first, then push is fired AFTER commit so the network calls do not hold
the DB transaction open.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.celery_app import celery_app
from app.core.database.engine import sync_engine
from app.models.attendance import AttendanceRecord
from app.models.notification import Notification
from app.services.attendance_service import (
    ABSENT_AFTER_HOURS,
    MAX_SHIFT_HOURS,
    apply_auto_close,
)
from app.services.push_service import send_push_to_user_sync

logger = logging.getLogger(__name__)

# Cap per run so a large backlog of open shifts can't block the worker.
MAX_PER_RUN = 200

_NOTIF_TYPE = "attendance_checkout_reminder"

# Copy must NOT mention the absent threshold (the grace window), per requirement.
REMINDER_TITLE = "Nhắc chấm công ra"
REMINDER_BODY = (
    "Bạn đã làm đủ 8 tiếng. Hãy chấm công ra ngay, nếu không hệ thống sẽ không "
    "tính giờ công hôm nay. Nếu làm ca mới, hãy chấm công ra rồi chấm công vào lại."
)

DEPLOY_TITLE = "Chấm công ra ngay"
DEPLOY_BODY = (
    "Hệ thống chấm công vừa cập nhật. Nếu bạn đang có ca làm chưa chấm công ra, "
    "hãy chấm công ra ngay để được tính giờ công. Làm ca mới thì chấm công ra rồi "
    "chấm công vào lại."
)


def _elapsed_hours(check_in_at: datetime, now: datetime) -> float:
    """Hours between check-in and now, tolerating a naive stored timestamp."""
    if check_in_at.tzinfo is None:
        check_in_at = check_in_at.replace(tzinfo=timezone.utc)
    return (now - check_in_at).total_seconds() / 3600.0


def _open_records(session: Session, *, limit: int | None = None) -> list[AttendanceRecord]:
    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.check_out_at.is_(None))  # type: ignore[union-attr]
        .order_by(AttendanceRecord.check_in_at.asc())  # type: ignore[union-attr]
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(session.exec(stmt).all())


@celery_app.task(
    name="app.jobs.attendance_reminder_job.remind_and_close_open_attendance",
    bind=True,
    max_retries=2,
)
def remind_and_close_open_attendance(_self) -> dict:
    """Remind workers past the max shift to check out, and mark absent past grace."""
    now = datetime.now(timezone.utc)
    reminded = 0
    absented = 0
    # (user_id, title, body, record_id) collected to push AFTER commit.
    pending_pushes: list[tuple] = []

    with Session(sync_engine) as session:
        for rec in _open_records(session, limit=MAX_PER_RUN):
            elapsed = _elapsed_hours(rec.check_in_at, now)
            if elapsed >= ABSENT_AFTER_HOURS:
                # Closed quietly with no hours — no push (don't surface the
                # absent threshold). The reminder already warned them at 8h.
                apply_auto_close(rec, absent=True)
                session.add(rec)
                absented += 1
            elif elapsed >= MAX_SHIFT_HOURS and rec.reminder_sent_at is None:
                session.add(
                    Notification(
                        user_id=rec.user_id,
                        type=_NOTIF_TYPE,
                        title=REMINDER_TITLE,
                        body=REMINDER_BODY,
                        entity_type="attendance",
                        entity_id=rec.id,
                    )
                )
                rec.reminder_sent_at = now
                session.add(rec)
                pending_pushes.append(
                    (rec.user_id, REMINDER_TITLE, REMINDER_BODY, rec.id)
                )
                reminded += 1

        session.commit()

        for user_id, title, body, rec_id in pending_pushes:
            try:
                send_push_to_user_sync(session, user_id, title, body, "attendance", rec_id)
            except Exception:
                logger.exception("Attendance reminder push failed for user %s", user_id)
        session.commit()  # persist any stale-subscription cleanup

    if reminded or absented:
        logger.info(
            "Attendance sweep: reminded=%d, marked_absent=%d", reminded, absented
        )
    return {"reminded": reminded, "absented": absented}


def notify_all_open_now(session: Session, *, now: datetime | None = None) -> int:
    """Notify EVERY account with an open shift to check out now (deploy one-shot).

    Sends regardless of elapsed time and regardless of a prior reminder, so the
    backlog of overdue shifts is cleared in one nudge. Returns the number of open
    shifts notified.
    """
    now = now or datetime.now(timezone.utc)
    pending_pushes: list[tuple] = []

    records = _open_records(session)
    for rec in records:
        session.add(
            Notification(
                user_id=rec.user_id,
                type=_NOTIF_TYPE,
                title=DEPLOY_TITLE,
                body=DEPLOY_BODY,
                entity_type="attendance",
                entity_id=rec.id,
            )
        )
        # Avoid an immediate duplicate from the periodic sweep.
        if rec.reminder_sent_at is None:
            rec.reminder_sent_at = now
            session.add(rec)
        pending_pushes.append((rec.user_id, DEPLOY_TITLE, DEPLOY_BODY, rec.id))

    session.commit()

    for user_id, title, body, rec_id in pending_pushes:
        try:
            send_push_to_user_sync(session, user_id, title, body, "attendance", rec_id)
        except Exception:
            logger.exception("Deploy attendance push failed for user %s", user_id)
    session.commit()

    logger.info("Deploy attendance notice queued for %d open shift(s)", len(pending_pushes))
    return len(pending_pushes)
