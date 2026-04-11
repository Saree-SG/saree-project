"""Audit log repository — append-only write helper."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import AuditLog


class AuditRepository:
    """
    Append-only audit log writer.

    Commits are NEVER issued here; the caller's transaction boundary commits.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Bind to async session."""
        self._session = session

    @staticmethod
    def _normalize(value: Any) -> Any:
        """Normalize Python payload to JSON-safe data."""
        if value is None:
            return None
        return json.loads(json.dumps(value, default=str))

    async def write(
        self,
        actor_id: uuid.UUID,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        old_value: Any = None,
        new_value: Any = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """
        Insert an immutable audit record within the current transaction.
        Flush immediately so the caller can reference the generated PK.
        """
        log = AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=self._normalize(old_value),
            new_value=self._normalize(new_value),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self._session.add(log)
        await self._session.flush()
        return log
