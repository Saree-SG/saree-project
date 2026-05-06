"""
Celery application singleton.

Broker and result backend are both Redis (REDIS_URL from settings).
Beat schedule is configured here:
  - outbox_dispatcher: runs every 30 seconds to relay pending outbox events
  - cascade_worker:    runs every 60 seconds to process pending cascade requests
  - daily_db_backup:  runs once per day at 02:00 UTC
  - daily_summary:    runs once per day at 07:00 UTC
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "saree_erp",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.jobs.outbox_dispatcher",
        "app.jobs.cascade_job",
        "app.jobs.daily_jobs",
        "app.jobs.delay_expiry_job",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    beat_schedule={
        "outbox-dispatcher": {
            "task": "app.jobs.outbox_dispatcher.dispatch_pending_events",
            "schedule": 30.0,
        },
        "cascade-worker": {
            "task": "app.jobs.cascade_job.process_pending_cascades",
            "schedule": 60.0,
        },
        "daily-db-backup": {
            "task": "app.jobs.daily_jobs.backup_database",
            "schedule": crontab(hour=2, minute=0),
        },
        "daily-summary": {
            "task": "app.jobs.daily_jobs.send_daily_summary",
            "schedule": crontab(hour=7, minute=0),
        },
        "delay-expiry": {
            "task": "app.jobs.delay_expiry_job.expire_pending_delay_requests",
            "schedule": crontab(minute=0),  # every hour
        },
    },
)
