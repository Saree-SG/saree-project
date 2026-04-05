"""Chat REST API router (rooms, members, message history, attachments)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, get_db
from app.shared.storage import LocalStorage
from app.models.chat import (
    ChatAttachment,
    ChatAttachmentPublic,
    ChatMember,
    ChatMemberAdd,
    ChatMemberPublic,
    ChatMemberWithUserPublic,
    ChatMessage,
    ChatMessageCreate,
    ChatMessagePublic,
    ChatRoom,
    ChatRoomCreate,
    ChatRoomPublic,
    ChatRoomUpdate,
)
from app.models.user import User
from app.shared.chat_service import (
    get_room_or_404,
    require_active_member,
    require_company,
    require_room_admin,
)

router = APIRouter(tags=["chat"])


_storage = LocalStorage()


@router.post("/chat/rooms", response_model=ChatRoomPublic, status_code=status.HTTP_201_CREATED)
def create_room(
    body: ChatRoomCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a chat room and add members."""

    company_id = require_company(session, current_user)
    room = ChatRoom(
        company_id=company_id,
        room_type=body.room_type,
        name=body.name,
        room_color=body.room_color,
        created_by=current_user.id,
    )
    session.add(room)
    session.flush()

    # Creator is always a member (owner)
    session.add(ChatMember(room_id=room.id, user_id=current_user.id, role="owner"))

    if body.member_user_ids:
        users = session.exec(
            select(User).where(User.id.in_(body.member_user_ids))  # type: ignore[attr-defined]
        ).all()
        found = {u.id for u in users}
        missing = [str(uid) for uid in body.member_user_ids if uid not in found]
        if missing:
            raise HTTPException(404, f"Users not found: {', '.join(missing)}")
        for u in users:
            if u.company_id != company_id:
                raise HTTPException(422, "All members must be in the same company")
            if u.id == current_user.id:
                continue
            session.add(ChatMember(room_id=room.id, user_id=u.id, role="member"))

    session.commit()
    session.refresh(room)
    return room


@router.get("/chat/rooms", response_model=list[ChatRoomPublic])
def list_my_rooms(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List rooms the current user belongs to."""

    require_company(session, current_user)
    room_ids = session.exec(
        select(ChatMember.room_id).where(
            ChatMember.user_id == current_user.id, ChatMember.left_at.is_(None)
        )
    ).all()
    if not room_ids:
        return []
    return session.exec(select(ChatRoom).where(ChatRoom.id.in_(room_ids))).all()  # type: ignore[attr-defined]


@router.get("/chat/rooms/{room_id}", response_model=ChatRoomPublic)
def get_room(
    room_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get room details (member-only)."""

    require_active_member(session, room_id, current_user.id)
    return get_room_or_404(session, room_id)


@router.patch("/chat/rooms/{room_id}", response_model=ChatRoomPublic)
def update_room(
    room_id: uuid.UUID,
    body: ChatRoomUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update room metadata (member-only temporary policy)."""

    require_active_member(session, room_id, current_user.id)
    room = get_room_or_404(session, room_id)
    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(room, k, v)
    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.delete("/chat/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a room (admin-only)."""

    require_room_admin(session, room_id, current_user.id)
    room = get_room_or_404(session, room_id)

    # Manual cascade delete (attachments -> messages -> members -> room)
    message_ids = session.exec(select(ChatMessage.id).where(ChatMessage.room_id == room_id)).all()
    if message_ids:
        attachments = session.exec(
            select(ChatAttachment).where(ChatAttachment.message_id.in_(message_ids))  # type: ignore[attr-defined]
        ).all()
        for a in attachments:
            session.delete(a)
        messages = session.exec(select(ChatMessage).where(ChatMessage.id.in_(message_ids))).all()  # type: ignore[attr-defined]
        for m in messages:
            session.delete(m)

    members = session.exec(select(ChatMember).where(ChatMember.room_id == room_id)).all()
    for mem in members:
        session.delete(mem)

    session.delete(room)
    session.commit()


@router.get("/chat/rooms/{room_id}/members", response_model=list[ChatMemberWithUserPublic])
def list_members(
    room_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List members of a room (member-only)."""

    require_active_member(session, room_id, current_user.id)
    rows = session.exec(
        select(ChatMember, User)
        .join(User, User.id == ChatMember.user_id)
        .where(ChatMember.room_id == room_id)
        .order_by(ChatMember.joined_at)
    ).all()
    return [
        ChatMemberWithUserPublic(
            room_id=m.room_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            left_at=m.left_at,
            email=u.email,
            full_name=u.full_name,
        )
        for (m, u) in rows
    ]


@router.post(
    "/chat/rooms/{room_id}/members",
    response_model=ChatMemberWithUserPublic,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    room_id: uuid.UUID,
    body: ChatMemberAdd,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add member to room (admin-only)."""

    require_room_admin(session, room_id, current_user.id)
    room = get_room_or_404(session, room_id)
    u = session.get(User, body.user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.company_id != room.company_id:
        raise HTTPException(422, "User must be in same company as room")

    existing = session.get(ChatMember, (room_id, body.user_id))
    if existing and existing.left_at is None:
        raise HTTPException(409, "User is already a member")
    if existing and existing.left_at is not None:
        existing.left_at = None
        existing.role = body.role
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return ChatMemberWithUserPublic(
            room_id=existing.room_id,
            user_id=existing.user_id,
            role=existing.role,
            joined_at=existing.joined_at,
            left_at=existing.left_at,
            email=u.email,
            full_name=u.full_name,
        )

    m = ChatMember(room_id=room_id, user_id=body.user_id, role=body.role)
    session.add(m)
    session.commit()
    session.refresh(m)
    return ChatMemberWithUserPublic(
        room_id=m.room_id,
        user_id=m.user_id,
        role=m.role,
        joined_at=m.joined_at,
        left_at=m.left_at,
        email=u.email,
        full_name=u.full_name,
    )


@router.delete("/chat/rooms/{room_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    room_id: uuid.UUID,
    user_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a room (admin-only)."""

    require_room_admin(session, room_id, current_user.id)
    m = session.get(ChatMember, (room_id, user_id))
    if not m:
        raise HTTPException(404, "Member not found")
    session.delete(m)
    session.commit()


@router.get("/chat/rooms/{room_id}/messages", response_model=list[ChatMessagePublic])
def list_messages(
    room_id: uuid.UUID,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List message history in a room (member-only)."""

    require_active_member(session, room_id, current_user.id)
    return session.exec(
        select(ChatMessage)
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()


@router.post(
    "/chat/rooms/{room_id}/messages",
    response_model=ChatMessagePublic,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    room_id: uuid.UUID,
    body: ChatMessageCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a text message in a room (member-only)."""

    require_active_member(session, room_id, current_user.id)
    msg = ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        message_type="text",
        content=body.content,
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


@router.post(
    "/chat/rooms/{room_id}/attachments",
    response_model=ChatAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    room_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an attachment and create a file-message in the room (member-only)."""

    require_active_member(session, room_id, current_user.id)
    try:
        stored = await _storage.save_upload(file)
    except ValueError as e:
        raise HTTPException(422, str(e))

    msg = ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        message_type="file",
        content=None,
    )
    session.add(msg)
    session.flush()

    att = ChatAttachment(
        message_id=msg.id,
        filename=file.filename,
        mime_type=file.content_type,
        size_bytes=stored.size_bytes,
        storage_path=stored.storage_path,
        public_url=stored.public_url,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return ChatAttachmentPublic(
        id=att.id,
        message_id=att.message_id,
        filename=att.filename,
        mime_type=att.mime_type,
        size_bytes=att.size_bytes,
        public_url=att.public_url,
        created_at=att.created_at,
    )

