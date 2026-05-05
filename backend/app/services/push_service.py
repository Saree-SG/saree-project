"""Web Push notification delivery via VAPID."""

from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.push_subscription import PushSubscription

if TYPE_CHECKING:
    pass


def _vapid_enabled() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


async def send_push_to_user(
    session: AsyncSession,
    user_id: uuid.UUID,
    title: str,
    body: str | None,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    """Send web push to all subscribed devices of a user. Fire-and-forget safe."""
    if not _vapid_enabled():
        return

    result = await session.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()
    if not subscriptions:
        return

    from pywebpush import webpush, WebPushException

    url = _build_url(entity_type, entity_id)
    payload = json.dumps({"title": title, "body": body or "", "url": url})
    stale_ids: list[uuid.UUID] = []

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code == 410:
                stale_ids.append(sub.id)
            else:
                logger.warning("Web push failed for sub {}: {}", sub.id, exc)
        except Exception as exc:
            logger.warning("Web push unexpected error for sub {}: {}", sub.id, exc)

    if stale_ids:
        await session.execute(
            delete(PushSubscription).where(PushSubscription.id.in_(stale_ids))
        )
        await session.flush()


def _build_url(entity_type: str, entity_id: uuid.UUID) -> str:
    base = str(settings.FRONTEND_HOST).rstrip("/")
    routes = {
        "task": "/tasks/",
        "project": "/projects/",
        "quotation": "/quotations/",
        "material_request": "/material-requests/",
        "chat": "/chat?room=",
    }
    path = routes.get(entity_type, "/")
    return f"{base}{path}{entity_id}"
