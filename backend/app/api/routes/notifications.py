"""In-app notification routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.notification import Notification, NotificationPublic, NotificationUnreadCount

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationPublic])
async def list_notifications(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
) -> list[NotificationPublic]:
    """List notifications for the current user, newest first."""
    result = await session.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [NotificationPublic.model_validate(r) for r in rows]


@router.get("/unread-count", response_model=NotificationUnreadCount)
async def unread_count(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> NotificationUnreadCount:
    """Return number of unread notifications for the current user."""
    result = await session.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    count = result.scalar_one()
    return NotificationUnreadCount(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
async def mark_read(
    notification_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> NotificationPublic:
    """Mark a single notification as read."""
    notif = await session.get(Notification, notification_id)
    if notif is None or notif.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    notif.is_read = True
    session.add(notif)
    await session.flush()
    return NotificationPublic.model_validate(notif)


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Mark all notifications for the current user as read."""
    await session.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
