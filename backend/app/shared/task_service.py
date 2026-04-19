"""
task_service.py — backward-compat shim.

All business logic has been moved to:
  app.services.task_service.TaskService  (async, for FastAPI routes)
  app.jobs.cascade_job                   (sync, for Celery workers)

This module re-exports the pure functions that scripts/seeds may still
import. Direct DB-accessing functions should not be imported from here.
"""

from __future__ import annotations

# utcnow was used by scripts — keep a local alias
from datetime import datetime, timezone

from app.services.task_service import (  # noqa: F401
    TimelineConflict,
    compute_task_status,
)


def utcnow() -> datetime:
    """Return current UTC time."""
    return datetime.now(timezone.utc)
