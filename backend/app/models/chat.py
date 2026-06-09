"""Chat models (rooms, members, messages, attachments)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import DateTime, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Return timezone-aware current UTC datetime."""

    return datetime.now(timezone.utc)


ChatRoomType = Literal["direct", "group"]
ChatMemberRole = Literal["owner", "admin", "member"]
ChatMessageType = Literal["text", "system", "file"]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class ChatRoomCreate(SQLModel):
    """Create a chat room (direct/group)."""

    room_type: ChatRoomType = "group"
    name: str | None = Field(default=None, max_length=255)
    room_color: str | None = Field(default=None, max_length=32)
    member_user_ids: list[uuid.UUID] = Field(default_factory=list)


class ChatRoomUpdate(SQLModel):
    """Update chat room fields (currently only name)."""

    name: str | None = Field(default=None, max_length=255)
    room_color: str | None = Field(default=None, max_length=32)


class ChatMemberAdd(SQLModel):
    """Add a member to a room."""

    user_id: uuid.UUID
    role: ChatMemberRole = "member"


class ChatMessageCreate(SQLModel):
    """Create a message in a room (text only)."""

    content: str = Field(sa_type=Text)


# ---------------------------------------------------------------------------
# DB Tables
# ---------------------------------------------------------------------------
class ChatRoom(SQLModel, table=True):
    """Chat room container."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    room_type: str = Field(default="group", max_length=20)
    name: str | None = Field(default=None, max_length=255)
    room_color: str | None = Field(default=None, max_length=32)
    created_by: uuid.UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class ChatMember(SQLModel, table=True):
    """Membership table (room ↔ user)."""

    __table_args__ = (UniqueConstraint("room_id", "user_id"),)

    room_id: uuid.UUID = Field(foreign_key="chatroom.id", primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    role: str = Field(default="member", max_length=20)
    joined_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    left_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)  # type: ignore
    )
    last_read_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)  # type: ignore
    )


class ChatMessage(SQLModel, table=True):
    """Persisted message."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    room_id: uuid.UUID = Field(foreign_key="chatroom.id", index=True)
    sender_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    message_type: str = Field(default="text", max_length=20)
    content: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class ChatAttachment(SQLModel, table=True):
    """Attachment metadata for a message (binary stored externally)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    message_id: uuid.UUID = Field(foreign_key="chatmessage.id", index=True)
    filename: str = Field(max_length=255)
    mime_type: str | None = Field(default=None, max_length=255)
    size_bytes: int | None = None
    storage_path: str = Field(max_length=1024)
    public_url: str | None = Field(default=None, max_length=1024)
    created_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class ChatRoomPublic(SQLModel):
    """Chat room response."""

    id: uuid.UUID
    company_id: uuid.UUID
    room_type: str
    name: str | None
    room_color: str | None
    created_by: uuid.UUID
    created_at: datetime
    last_message_content: str | None = None
    last_message_at: datetime | None = None


class ChatMemberPublic(SQLModel):
    """Chat member response."""

    room_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime
    left_at: datetime | None


class ChatMemberWithUserPublic(ChatMemberPublic):
    """Chat member response enriched with basic user info."""

    email: str
    full_name: str | None = None


class ChatAttachmentPublic(SQLModel):
    """Chat attachment response."""

    id: uuid.UUID
    message_id: uuid.UUID
    filename: str
    mime_type: str | None
    size_bytes: int | None
    public_url: str | None
    created_at: datetime


class ChatMessagePublic(SQLModel):
    """Chat message response."""

    id: uuid.UUID
    room_id: uuid.UUID
    sender_id: uuid.UUID
    message_type: str
    content: str | None
    created_at: datetime
    attachments: list[ChatAttachmentPublic] = []


class ChatUnreadCountPublic(SQLModel):
    """Total unread message count across all rooms."""

    count: int

