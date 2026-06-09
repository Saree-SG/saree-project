"""In-app notification routes."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update

from app.api.deps import AsyncSessionDep, CurrentUser
from app.core.config import settings
from app.models.notification import Notification, NotificationPublic, NotificationUnreadCount
from app.models.push_subscription import PushSubscription

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Notification categories split the bell into two zones so chat messages never
# crowd out task/quotation/etc. notifications. "chat" == chat messages;
# "other" == everything else.
Category = Literal["chat", "other"]


def _category_clause(category: Category | None) -> list:
    """SQL filter for a notification category (empty list = no filter)."""
    if category == "chat":
        return [Notification.entity_type == "chat"]
    if category == "other":
        return [Notification.entity_type != "chat"]
    return []


@router.get("", response_model=list[NotificationPublic])
async def list_notifications(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    category: Category | None = Query(default=None),
) -> list[NotificationPublic]:
    """List notifications for the current user, newest first.

    ``category`` optionally restricts to "chat" or "other" so each bell tab
    paginates independently — a flood of chat messages can't push task
    notifications out of the (limited) result window.
    """
    result = await session.execute(
        select(Notification)
        .where(
            Notification.user_id == current_user.id,
            *_category_clause(category),
        )
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
    category: Category | None = Query(default=None),
) -> NotificationUnreadCount:
    """Return number of unread notifications, optionally filtered by category."""
    result = await session.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
            *_category_clause(category),
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
    category: Category | None = Query(default=None),
) -> None:
    """Mark all notifications as read, optionally only within one category."""
    await session.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
            *_category_clause(category),
        )
        .values(is_read=True)
    )


# ---------------------------------------------------------------------------
# Web Push
# ---------------------------------------------------------------------------

class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class VapidKeyResponse(BaseModel):
    public_key: str | None


@router.get("/push/vapid-key", response_model=VapidKeyResponse)
async def get_vapid_public_key() -> VapidKeyResponse:
    """Return the VAPID public key for the frontend to subscribe."""
    return VapidKeyResponse(public_key=settings.VAPID_PUBLIC_KEY)


@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe_push(
    body: PushSubscribeRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Register or update a push subscription for the current user."""
    existing = await session.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    sub = existing.scalar_one_or_none()
    if sub:
        sub.user_id = current_user.id
        sub.p256dh = body.p256dh
        sub.auth = body.auth
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
        )
    session.add(sub)


@router.delete("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_push(
    body: PushSubscribeRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Remove a push subscription for the current user."""
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
