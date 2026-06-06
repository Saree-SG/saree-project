"""
Audit service — async append-only write helper.

Callers must NOT commit; the caller's transaction boundary handles commit.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import AuditLog


def _normalize_json(value: Any) -> Any:
    """Normalize Python payload into JSON-serializable data."""
    if value is None:
        return None
    return json.loads(json.dumps(value, default=str))


async def write_audit_log(
    session: AsyncSession,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    old_value: Any = None,
    new_value: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """
    Write an immutable audit record within the current transaction.
    Flushes immediately so the caller can reference the generated PK.
    """
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=_normalize_json(old_value),
        new_value=_normalize_json(new_value),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(log)
    await session.flush()
    return log
