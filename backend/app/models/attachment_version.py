"""Shared version history for attachments (quotation/contract/incident/chat).

One table for every attachment type rather than five near-identical tables —
see docs/plan-chi-tiet-storage-office-be-fe.md Phần 0 for the rationale.
Schema created in alembic/versions/0053_office_foundation.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AttachmentVersion(SQLModel, table=True):
    __tablename__ = "attachment_version"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    attachment_type: str = Field(max_length=30, index=True)
    attachment_id: uuid.UUID = Field(index=True)
    version_no: int
    storage_key: str = Field(max_length=1000)
    size_bytes: int
    checksum: str = Field(max_length=64)
    is_autosave: bool = Field(default=False)
    edited_by: uuid.UUID = Field(foreign_key="user.id")
    edited_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class AttachmentVersionPublic(SQLModel):
    id: uuid.UUID
    attachment_type: str
    attachment_id: uuid.UUID
    version_no: int
    size_bytes: int
    is_autosave: bool
    edited_by: uuid.UUID
    edited_by_name: str | None = None
    edited_at: datetime
