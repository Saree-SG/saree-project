"""
Outbox & Cascade models — durable event/job tracking.

OutboxEvent: generic domain events written in-transaction by services;
  the outbox dispatcher Celery job reads and forwards them.

CascadeRequest: tracks a single cascade-delay propagation attempt with
  state-machine fields so workers can retry without double-processing.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# OutboxEvent — generic transactional outbox
# ---------------------------------------------------------------------------

class OutboxEvent(SQLModel, table=True):
    """
    Generic outbox event.

    Written inside the same DB transaction as the business operation so that
    events are never lost even if the process crashes after commit.

    Status machine:
      pending → processing → done
                           → failed  (retry_count >= MAX, or unrecoverable error)
    """

    __tablename__ = "outboxevent"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_type: str = Field(max_length=100, index=True)
    payload: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    status: str = Field(default="pending", max_length=20, index=True)
    retry_count: int = Field(default=0)
    error_message: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    processed_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# CascadeRequest — task cascade-delay saga
# ---------------------------------------------------------------------------

class CascadeRequest(SQLModel, table=True):
    """
    Tracks a single cascade-delay propagation saga.

    When a task's end_time moves forward the service writes this record in the
    same transaction.  The cascade Celery job picks it up, walks the
    dependency graph, and marks each downstream task.

    policy_stop=True (default) → if cascade fails, block downstream tasks
    policy_stop=False          → retry until fully propagated (option B)

    Status machine:
      pending → processing → done
                           → failed   (unrecoverable; downstream tasks locked)
                           → stopped  (policy_stop=True, operator must resolve)
    """

    __tablename__ = "cascaderequest"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    delay_seconds: int
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    policy_stop: bool = Field(default=True)
    status: str = Field(default="pending", max_length=20, index=True)
    retry_count: int = Field(default=0)
    error_message: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    processed_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# Public response schemas
# ---------------------------------------------------------------------------

class OutboxEventPublic(SQLModel):
    id: uuid.UUID
    event_type: str
    status: str
    retry_count: int
    created_at: datetime
    processed_at: datetime | None


class CascadeRequestPublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    delay_seconds: int
    status: str
    retry_count: int
    policy_stop: bool
    created_at: datetime
    processed_at: datetime | None
