"""Outbox + CascadeRequest repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.outbox import CascadeRequest, OutboxEvent


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OutboxRepository(BaseRepository[OutboxEvent]):
    """Async repository for OutboxEvent."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to OutboxEvent model and session."""
        super().__init__(OutboxEvent, session)

    async def create_event(self, event_type: str, payload: dict) -> OutboxEvent:
        """Write a pending outbox event within the current transaction."""
        event = OutboxEvent(event_type=event_type, payload=payload)
        self._session.add(event)
        await self._session.flush()
        return event

    async def list_pending(self, limit: int = 100) -> Sequence[OutboxEvent]:
        """Return pending events ordered by creation time (oldest first)."""
        result = await self._execute(
            select(OutboxEvent)
            .where(OutboxEvent.status == "pending")
            .order_by(OutboxEvent.created_at)
            .limit(limit)
        )
        return result.scalars().all()

    async def mark_processing(self, event: OutboxEvent) -> None:
        """Transition event to processing state."""
        event.status = "processing"
        self._session.add(event)
        await self._session.flush()

    async def mark_done(self, event: OutboxEvent) -> None:
        """Transition event to done state."""
        event.status = "done"
        event.processed_at = _utcnow()
        self._session.add(event)
        await self._session.flush()

    async def mark_failed(self, event: OutboxEvent, error: str) -> None:
        """Transition event to failed state with error message."""
        event.status = "failed"
        event.error_message = error[:2000]
        event.retry_count += 1
        self._session.add(event)
        await self._session.flush()

    async def reset_to_pending(self, event: OutboxEvent) -> None:
        """Re-queue a failed event for retry."""
        event.status = "pending"
        self._session.add(event)
        await self._session.flush()


class CascadeRepository(BaseRepository[CascadeRequest]):
    """Async repository for CascadeRequest saga records."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to CascadeRequest model and session."""
        super().__init__(CascadeRequest, session)

    async def create_request(
        self,
        task_id: uuid.UUID,
        delay_seconds: int,
        actor_id: uuid.UUID,
        policy_stop: bool = True,
    ) -> CascadeRequest:
        """Write a pending cascade request within the current transaction."""
        req = CascadeRequest(
            task_id=task_id,
            delay_seconds=delay_seconds,
            actor_id=actor_id,
            policy_stop=policy_stop,
        )
        self._session.add(req)
        await self._session.flush()
        return req

    async def list_pending(self, limit: int = 50) -> Sequence[CascadeRequest]:
        """Return pending cascade requests oldest-first."""
        result = await self._execute(
            select(CascadeRequest)
            .where(CascadeRequest.status == "pending")
            .order_by(CascadeRequest.created_at)
            .limit(limit)
        )
        return result.scalars().all()

    async def mark_processing(self, req: CascadeRequest) -> None:
        """Transition cascade request to processing."""
        req.status = "processing"
        self._session.add(req)
        await self._session.flush()

    async def mark_done(self, req: CascadeRequest) -> None:
        """Transition cascade request to done."""
        req.status = "done"
        req.processed_at = _utcnow()
        self._session.add(req)
        await self._session.flush()

    async def mark_failed(self, req: CascadeRequest, error: str) -> None:
        """Transition cascade request to failed."""
        req.status = "failed"
        req.error_message = error[:2000]
        req.retry_count += 1
        self._session.add(req)
        await self._session.flush()

    async def mark_stopped(self, req: CascadeRequest, reason: str) -> None:
        """Transition cascade request to stopped (policy A: stop-chain)."""
        req.status = "stopped"
        req.error_message = reason[:2000]
        self._session.add(req)
        await self._session.flush()
