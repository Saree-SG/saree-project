"""
Audit service — append-only write_audit_log().

Any module can call this without importing Task/Project/etc.
entity_type is a free string so future modules plug in automatically.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlmodel import Session

from app.models.task import AuditLog


def write_audit_log(
    session: Session,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    old_value: Any | None = None,
    new_value: Any | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """
    Write an immutable audit record.
    old_value / new_value can be any JSON-serializable value (dict, str, int).
    """
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=json.dumps(old_value, default=str) if old_value is not None else None,
        new_value=json.dumps(new_value, default=str) if new_value is not None else None,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(log)
    # NOTE: caller is responsible for session.commit()
    return log
