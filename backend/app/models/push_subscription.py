from __future__ import annotations

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class PushSubscription(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    endpoint: str = Field(unique=True)
    p256dh: str
    auth: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
