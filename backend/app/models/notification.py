"""Notification model — in-app notifications for users."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Notification(SQLModel, table=True):
    """Persisted in-app notification row."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    type: str = Field(max_length=50)
    # task_assigned | delay_requested | delay_approved | delay_rejected
    # proof_uploaded | proof_approved | proof_rejected | task_done
    title: str = Field(max_length=500)
    body: str | None = Field(default=None, max_length=1000)
    entity_type: str = Field(max_length=50)  # "task" | "project"
    entity_id: uuid.UUID
    is_read: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class NotificationPublic(SQLModel):
    """Response schema for a notification."""

    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    title: str
    body: str | None
    entity_type: str
    entity_id: uuid.UUID
    is_read: bool
    created_at: datetime


class NotificationUnreadCount(SQLModel):
    """Response schema for unread notification count."""

    count: int
