"""
Daily Celery Beat jobs.

- backup_database:  pg_dump to a timestamped file under /backups/
- send_daily_summary: aggregate KPIs (tasks overdue, completed today) and log/email
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import date, datetime, timezone

from sqlmodel import Session, func, select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database.engine import sync_engine
from app.models.task import Task

logger = logging.getLogger(__name__)

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")


@celery_app.task(name="app.jobs.daily_jobs.backup_database", bind=True, max_retries=2)
def backup_database(self) -> dict:
    """
    Run pg_dump and save the result to BACKUP_DIR with a datestamp filename.
    Requires BACKUP_DIR to be writable and pg_dump to be in PATH.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{BACKUP_DIR}/saree_erp_{timestamp}.dump"

    try:
        result = subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                f"--file={filename}",
                str(settings.SQLALCHEMY_DATABASE_URI).replace("postgresql+psycopg://", "postgresql://"),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr}")
        logger.info("Database backup created: %s", filename)
        return {"status": "ok", "file": filename}
    except Exception as exc:
        logger.exception("Backup failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 10)


@celery_app.task(name="app.jobs.daily_jobs.send_daily_summary", bind=True, max_retries=2)
def send_daily_summary(self) -> dict:
    """
    Aggregate daily KPIs and log them (extend with email or Slack as needed).
    KPIs:
      - tasks completed today
      - tasks overdue
      - tasks due today
    """
    today = date.today()
    now = datetime.now(timezone.utc)

    try:
        with Session(sync_engine) as session:
            completed_today = session.exec(
                select(func.count(Task.id)).where(
                    Task.status == "done",
                    Task.actual_end_time >= datetime(today.year, today.month, today.day, tzinfo=timezone.utc),
                    Task.is_deleted == False,  # noqa: E712
                )
            ).one()

            overdue = session.exec(
                select(func.count(Task.id)).where(
                    Task.is_deleted == False,  # noqa: E712
                    Task.status.notin_(["done"]),  # type: ignore[attr-defined]
                    Task.end_time < now,
                )
            ).one()

            due_today = session.exec(
                select(func.count(Task.id)).where(
                    Task.is_deleted == False,  # noqa: E712
                    Task.status.notin_(["done"]),  # type: ignore[attr-defined]
                    Task.end_time >= datetime(today.year, today.month, today.day, tzinfo=timezone.utc),
                    Task.end_time < datetime(today.year, today.month, today.day + 1, tzinfo=timezone.utc),
                )
            ).one()

        summary = {
            "date": today.isoformat(),
            "completed_today": completed_today,
            "overdue": overdue,
            "due_today": due_today,
        }
        logger.info("Daily summary: %s", summary)
        return summary
    except Exception as exc:
        logger.exception("Daily summary failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
