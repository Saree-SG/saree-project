"""Chat domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.chat import (
    ChatAttachment,
    ChatMember,
    ChatMessage,
    ChatRoom,
)
from app.models.org import UserCompanyRole


class ChatRepository(BaseRepository[ChatRoom]):
    """Async repository for Chat entities."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to ChatRoom model and session."""
        super().__init__(ChatRoom, session)

    # ------------------------------------------------------------------
    # Company helpers (chat module needs company_id)
    # ------------------------------------------------------------------

    async def get_user_company_id(self, user_id: uuid.UUID, company_id: uuid.UUID | None) -> uuid.UUID:
        """
        Resolve company_id for the chat module.
        Falls back to primary company role if company_id is not set on the user.
        """
        if company_id:
            return company_id
        result = await self._execute(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.is_primary == True,  # noqa: E712
            )
        )
        primary = result.scalars().first()
        if not primary:
            raise HTTPException(422, "User has no company_id; cannot use chat module")
        return primary.company_id

    # ------------------------------------------------------------------
    # Room
    # ------------------------------------------------------------------

    async def get_room_or_404(self, room_id: uuid.UUID) -> ChatRoom:
        """Return room or raise 404."""
        room = await self.get_by_id(room_id)
        if not room:
            raise HTTPException(404, "Chat room not found")
        return room

    async def list_rooms_for_user(self, user_id: uuid.UUID) -> Sequence[ChatRoom]:
        """Return rooms the user is an active member of."""
        room_ids_stmt = select(ChatMember.room_id).where(
            ChatMember.user_id == user_id,
            ChatMember.left_at.is_(None),
        )
        result = await self._execute(room_ids_stmt)
        room_ids = result.scalars().all()
        if not room_ids:
            return []
        rooms_result = await self._execute(
            select(ChatRoom).where(ChatRoom.id.in_(room_ids))  # type: ignore[arg-type]
        )
        return rooms_result.scalars().all()

    async def create_room(self, data: dict) -> ChatRoom:
        """Insert a new chat room."""
        room = ChatRoom(**data)
        self._session.add(room)
        await self._session.flush()
        await self._session.refresh(room)
        return room

    async def update_room(self, room: ChatRoom, data: dict) -> ChatRoom:
        """Apply partial update to room."""
        for field, val in data.items():
            setattr(room, field, val)
        self._session.add(room)
        await self._session.flush()
        await self._session.refresh(room)
        return room

    # ------------------------------------------------------------------
    # Members
    # ------------------------------------------------------------------

    async def get_member(
        self, room_id: uuid.UUID, user_id: uuid.UUID
    ) -> ChatMember | None:
        """Return membership row (including left members) or None."""
        result = await self._execute(
            select(ChatMember).where(
                ChatMember.room_id == room_id,
                ChatMember.user_id == user_id,
            )
        )
        return result.scalars().first()

    async def require_active_member(
        self, room_id: uuid.UUID, user_id: uuid.UUID
    ) -> ChatMember:
        """Require active membership; raise 403 if not member or left."""
        m = await self.get_member(room_id, user_id)
        if not m or m.left_at is not None:
            raise HTTPException(403, "Not a member of this chat room")
        return m

    async def require_room_admin(
        self, room_id: uuid.UUID, user_id: uuid.UUID
    ) -> ChatMember:
        """Require owner/admin role in room."""
        m = await self.require_active_member(room_id, user_id)
        if m.role not in {"owner", "admin"}:
            raise HTTPException(403, "Room admin permission required")
        return m

    async def add_member(
        self, room_id: uuid.UUID, user_id: uuid.UUID, role: str = "member"
    ) -> ChatMember:
        """Add a user as a member of a room."""
        member = ChatMember(room_id=room_id, user_id=user_id, role=role)
        self._session.add(member)
        await self._session.flush()
        return member

    async def list_members(self, room_id: uuid.UUID) -> Sequence[ChatMember]:
        """Return active members of a room."""
        result = await self._execute(
            select(ChatMember).where(
                ChatMember.room_id == room_id,
                ChatMember.left_at.is_(None),
            )
        )
        return result.scalars().all()

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    async def list_messages(
        self,
        room_id: uuid.UUID,
        before_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> Sequence[ChatMessage]:
        """Return messages for a room, newest first."""
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.desc())  # type: ignore[attr-defined]
            .limit(limit)
        )
        if before_id is not None:
            before = await self._session.get(ChatMessage, before_id)
            if before and before.created_at:
                stmt = stmt.where(ChatMessage.created_at < before.created_at)
        result = await self._execute(stmt)
        return result.scalars().all()

    async def create_message(self, data: dict) -> ChatMessage:
        """Insert a new chat message."""
        msg = ChatMessage(**data)
        self._session.add(msg)
        await self._session.flush()
        await self._session.refresh(msg)
        return msg

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def create_attachment(self, data: dict) -> ChatAttachment:
        """Insert a file attachment record."""
        att = ChatAttachment(**data)
        self._session.add(att)
        await self._session.flush()
        await self._session.refresh(att)
        return att
