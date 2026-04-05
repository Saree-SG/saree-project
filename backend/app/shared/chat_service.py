"""Chat service helpers (permissions, membership, CRUD primitives)."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.chat import ChatMember, ChatRoom
from app.models.org import UserCompanyRole
from app.models.user import User


def require_company(session: Session, current_user: User) -> uuid.UUID:
    """Return company_id for current user; fallback to primary company role."""

    if current_user.company_id:
        return current_user.company_id

    primary_role = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == current_user.id,
            UserCompanyRole.is_primary == True,  # noqa: E712
        )
    ).first()
    if not primary_role:
        raise HTTPException(422, "User has no company_id; cannot use chat module")

    current_user.company_id = primary_role.company_id
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return primary_role.company_id


def get_room_or_404(session: Session, room_id: uuid.UUID) -> ChatRoom:
    """Load a chat room by id or raise 404."""

    room = session.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(404, "Chat room not found")
    return room


def get_member(session: Session, room_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember | None:
    """Return membership row if present (including left members)."""

    return session.exec(
        select(ChatMember).where(ChatMember.room_id == room_id, ChatMember.user_id == user_id)
    ).first()


def require_active_member(session: Session, room_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember:
    """Require that user is an active member of room (left_at is null)."""

    m = get_member(session, room_id, user_id)
    if not m or m.left_at is not None:
        raise HTTPException(403, "Not a member of this chat room")
    return m


def require_room_admin(session: Session, room_id: uuid.UUID, user_id: uuid.UUID) -> ChatMember:
    """Require that user is owner/admin of room."""

    m = require_active_member(session, room_id, user_id)
    if m.role not in {"owner", "admin"}:
        raise HTTPException(403, "Room admin permission required")
    return m

