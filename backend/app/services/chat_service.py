"""Chat service — room and message business logic."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatMember, ChatMessage, ChatRoom
from app.models.notification import Notification
from app.repositories.chat_repository import ChatRepository
from app.repositories.user_repository import UserRepository
from app.services.push_service import send_push_bg


class ChatService:
    """Orchestrates chat room and message operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind service to async session."""
        self._session = session
        self._chat_repo = ChatRepository(session)
        self._user_repo = UserRepository(session)

    async def get_or_resolve_company_id(
        self, current_user: Any
    ) -> uuid.UUID:
        """Return user's company_id, resolving from primary role if needed."""
        return await self._chat_repo.get_user_company_id(
            current_user.id, current_user.company_id
        )

    async def list_rooms(self, current_user: Any) -> list[ChatRoom]:
        """Return rooms the user is active member of."""
        return list(await self._chat_repo.list_rooms_for_user(current_user.id))

    async def create_room(
        self,
        current_user: Any,
        name: str,
        room_type: str = "group",
        description: str | None = None,
        color: str | None = None,
    ) -> ChatRoom:
        """Create a chat room and add creator as owner."""
        company_id = await self.get_or_resolve_company_id(current_user)
        room = await self._chat_repo.create_room({
            "company_id": company_id,
            "name": name,
            "room_type": room_type,
            "description": description,
            "color": color,
            "created_by": current_user.id,
        })
        await self._chat_repo.add_member(room.id, current_user.id, role="owner")
        return room

    async def get_room(self, room_id: uuid.UUID, current_user: Any) -> ChatRoom:
        """Return room if user is an active member."""
        room = await self._chat_repo.get_room_or_404(room_id)
        await self._chat_repo.require_active_member(room_id, current_user.id)
        return room

    async def update_room(
        self, room_id: uuid.UUID, data: dict, current_user: Any
    ) -> ChatRoom:
        """Update room metadata (admin only)."""
        await self._chat_repo.require_room_admin(room_id, current_user.id)
        room = await self._chat_repo.get_room_or_404(room_id)
        room = await self._chat_repo.update_room(room, data)
        return room

    async def list_members(
        self, room_id: uuid.UUID, current_user: Any
    ) -> list[ChatMember]:
        """List active members after verifying caller is a member."""
        await self._chat_repo.require_active_member(room_id, current_user.id)
        return list(await self._chat_repo.list_members(room_id))

    async def add_member(
        self,
        room_id: uuid.UUID,
        user_id: uuid.UUID,
        current_user: Any,
    ) -> ChatMember:
        """Add a user to a room (admin only)."""
        await self._chat_repo.require_room_admin(room_id, current_user.id)
        member = await self._chat_repo.add_member(room_id, user_id)
        return member

    async def leave_room(
        self, room_id: uuid.UUID, current_user: Any
    ) -> None:
        """Mark user as having left the room."""
        from datetime import datetime, timezone
        m = await self._chat_repo.require_active_member(room_id, current_user.id)
        m.left_at = datetime.now(timezone.utc)
        self._session.add(m)

    async def list_messages(
        self,
        room_id: uuid.UUID,
        current_user: Any,
        before_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[ChatMessage]:
        """Return messages for a room (member only)."""
        await self._chat_repo.require_active_member(room_id, current_user.id)
        return list(await self._chat_repo.list_messages(room_id, before_id, limit))

    async def send_message(
        self,
        room_id: uuid.UUID,
        content: str,
        current_user: Any,
    ) -> ChatMessage:
        """Send a text message to a room and notify other members."""
        await self._chat_repo.require_active_member(room_id, current_user.id)
        msg = await self._chat_repo.create_message({
            "room_id": room_id,
            "sender_id": current_user.id,
            "message_type": "text",
            "content": content,
        })
        await self.notify_room_of_message(room_id, current_user, content[:100])
        return msg

    async def notify_room_of_message(
        self,
        room_id: uuid.UUID,
        current_user: Any,
        body: str | None,
        await_push: bool = False,
    ) -> None:
        """Persist an in-app notification + fire web push for all other members.

        Title follows "{user_name} đã gửi tin nhắn vào {group_name}"; body holds
        a short preview of the message content (or None for attachments).

        ``await_push`` controls how web push is dispatched. Inside a long-lived
        WebSocket handler a fire-and-forget ``asyncio.create_task`` can be
        garbage-collected before it runs (the parent coroutine just blocks on
        ``receive`` with no reference to the task), so the phone push silently
        never sends while the in-app notification — committed via the session —
        still appears. WS callers pass ``await_push=True`` to await delivery
        directly; the HTTP path keeps the non-blocking fire-and-forget.
        """
        members = await self._chat_repo.list_members(room_id)
        room = await self._chat_repo.get_room_or_404(room_id)
        sender_name = (
            getattr(current_user, "full_name", None)
            or getattr(current_user, "email", "")
            or "Ai đó"
        )
        room_name = room.name or "nhóm chat"
        title = f"{sender_name} đã gửi tin nhắn vào {room_name}"
        push_targets: list[uuid.UUID] = []
        for member in members:
            if member.user_id != current_user.id:
                self._session.add(
                    Notification(
                        user_id=member.user_id,
                        type="chat_message",
                        title=title,
                        body=body,
                        entity_type="chat",
                        entity_id=room_id,
                    )
                )
                push_targets.append(member.user_id)
        await self._session.flush()
        if await_push:
            for user_id in push_targets:
                await send_push_bg(user_id, title, body, "chat", room_id)
        else:
            for user_id in push_targets:
                asyncio.create_task(
                    send_push_bg(user_id, title, body, "chat", room_id)
                )
