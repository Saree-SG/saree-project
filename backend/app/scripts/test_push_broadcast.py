"""Broadcast a test Web Push notification to all subscribed devices.

Usage:
    uv run python -m app.scripts.test_push_broadcast
    uv run python -m app.scripts.test_push_broadcast --title "Ping" --body "Hello"
    uv run python -m app.scripts.test_push_broadcast --url "https://example.com/tasks"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid

from loguru import logger
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database.engine import AsyncSessionFactory
from app.models.push_subscription import PushSubscription


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for the push broadcast test script."""
    parser = argparse.ArgumentParser(
        description="Send one test push notification to all subscribed devices.",
    )
    parser.add_argument(
        "--title",
        default="Saree ERP Test Notification",
        help="Notification title.",
    )
    parser.add_argument(
        "--body",
        default="This is a push test sent to all subscribed devices.",
        help="Notification body.",
    )
    parser.add_argument(
        "--url",
        default=str(settings.FRONTEND_HOST).rstrip("/") + "/",
        help="URL opened when the notification is clicked.",
    )
    return parser.parse_args()


def vapid_enabled() -> bool:
    """Return True when all required VAPID settings are configured."""
    return bool(
        settings.VAPID_PRIVATE_KEY
        and settings.VAPID_PUBLIC_KEY
        and settings.VAPID_SUBJECT
    )


async def send_test_push_to_all(title: str, body: str, url: str) -> None:
    """Send a test push payload to every PushSubscription in the database."""
    if not vapid_enabled():
        logger.error(
            "VAPID is not configured. Set VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT.",
        )
        return

    from pywebpush import WebPushException, webpush

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "entity_type": "test",
            "entity_id": str(uuid.uuid4()),
        }
    )

    async with AsyncSessionFactory() as session:
        result = await session.execute(select(PushSubscription))
        subscriptions = result.scalars().all()

        if not subscriptions:
            logger.warning("No subscriptions found. Subscribe at least one device first.")
            return

        stale_ids: list[uuid.UUID] = []
        sent_count = 0
        failed_count = 0

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
                sent_count += 1
            except WebPushException as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code in {404, 410}:
                    stale_ids.append(sub.id)
                failed_count += 1
                logger.warning(
                    "Push failed for subscription id={} user_id={} status={} error={}",
                    sub.id,
                    sub.user_id,
                    status_code,
                    exc,
                )
            except Exception as exc:
                failed_count += 1
                logger.warning(
                    "Unexpected push error for subscription id={} user_id={} error={}",
                    sub.id,
                    sub.user_id,
                    exc,
                )

        if stale_ids:
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id.in_(stale_ids))
            )
            await session.commit()
            logger.info("Removed {} stale subscriptions (404/410).", len(stale_ids))
        else:
            await session.rollback()

        logger.info(
            "Broadcast done. total={} sent={} failed={}",
            len(subscriptions),
            sent_count,
            failed_count,
        )


async def async_main() -> None:
    """Run the push broadcast flow from CLI arguments."""
    args = parse_args()
    await send_test_push_to_all(args.title, args.body, args.url)


def main() -> None:
    """Entrypoint for python -m app.scripts.test_push_broadcast."""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
