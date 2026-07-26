"""Chat REST routes — full async."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.chat import (
    ChatAttachmentPublic,
    ChatMember,
    ChatMemberAdd,
    ChatMemberWithUserPublic,
    ChatMessage,
    ChatMessageCreate,
    ChatMessagePublic,
    ChatRoom,
    ChatRoomCreate,
    ChatRoomPublic,
    ChatRoomUpdate,
    ChatUnreadCountPublic,
)
from app.models.user import User
from app.repositories.chat_repository import ChatRepository
from app.repositories.user_repository import UserRepository
from app.services.chat_service import ChatService
from app.shared.chat_realtime import chat_fanout
from app.shared.permission import has_company_wide_scope
from app.shared.storage import LocalStorage

ANNOUNCEMENT_ROOM_TYPE = "announcement"
ANNOUNCEMENT_ROOM_NAME = "📢 Thông báo chung"

router = APIRouter(tags=["chat"])

_storage = LocalStorage()


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------

@router.post("/chat/rooms", response_model=ChatRoomPublic, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: ChatRoomCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatRoomPublic:
    """Create a chat room and add members."""
    repo = ChatRepository(session)
    user_repo = UserRepository(session)
    company_id = await repo.get_user_company_id(current_user.id, current_user.company_id)

    room = await repo.create_room({
        "company_id": company_id,
        "room_type": body.room_type,
        "name": body.name,
        "room_color": getattr(body, "room_color", None),
        "created_by": current_user.id,
    })
    await repo.add_member(room.id, current_user.id, "owner")

    if body.member_user_ids:
        users = await user_repo.list_by_ids(list(body.member_user_ids))
        found = {u.id for u in users}
        missing = [str(uid) for uid in body.member_user_ids if uid not in found]
        if missing:
            raise HTTPException(404, f"Users not found: {', '.join(missing)}")
        for u in users:
            if u.company_id != company_id:
                raise HTTPException(422, "All members must be in the same company")
            if u.id == current_user.id:
                continue
            await repo.add_member(room.id, u.id, "member")

    return room  # type: ignore[return-value]


@router.get("/chat/rooms", response_model=list[ChatRoomPublic])
async def list_my_rooms(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[ChatRoomPublic]:
    """List rooms the current user belongs to, sorted by last message."""
    repo = ChatRepository(session)
    rooms_data = await repo.list_rooms_for_user(current_user.id)
    return [ChatRoomPublic(**d) for d in rooms_data]


async def _ensure_announcement_room(
    session: AsyncSessionDep, current_user: CurrentUser
) -> ChatRoom:
    """Get-or-create phòng "Thông báo chung" của công ty + đồng bộ thành viên.

    Mọi nhân viên đang hoạt động của công ty được thêm làm member (để đọc + nhận
    push). Chỉ quản lý được gửi (gate ở create_message). Gọi lại sẽ tự bù thành
    viên mới.
    """
    repo = ChatRepository(session)
    company_id = await repo.get_user_company_id(current_user.id, current_user.company_id)

    room = (await session.execute(
        select(ChatRoom).where(
            ChatRoom.company_id == company_id,
            ChatRoom.room_type == ANNOUNCEMENT_ROOM_TYPE,
        )
    )).scalars().first()
    if room is None:
        room = await repo.create_room({
            "company_id": company_id,
            "room_type": ANNOUNCEMENT_ROOM_TYPE,
            "name": ANNOUNCEMENT_ROOM_NAME,
            "created_by": current_user.id,
        })

    # Đồng bộ thành viên = mọi user active trong công ty.
    user_ids = (await session.execute(
        select(User.id).where(
            User.company_id == company_id,
            User.is_active == True,  # noqa: E712
        )
    )).scalars().all()
    for uid in user_ids:
        existing = await repo.get_member(room.id, uid)
        if existing is None:
            await repo.add_member(room.id, uid, "owner" if uid == current_user.id else "member")
        elif existing.left_at is not None:
            existing.left_at = None
            session.add(existing)
    await session.flush()
    return room


@router.post("/chat/announcement-room", response_model=ChatRoomPublic)
async def ensure_announcement_room(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatRoomPublic:
    """Trả về (tạo nếu chưa có) phòng Thông báo chung của công ty."""
    room = await _ensure_announcement_room(session, current_user)
    return await ChatRepository(session).get_room_or_404(room.id)  # type: ignore[return-value]


@router.get("/chat/rooms/{room_id}", response_model=ChatRoomPublic)
async def get_room(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatRoomPublic:
    """Get room details (member-only)."""
    repo = ChatRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    return await repo.get_room_or_404(room_id)  # type: ignore[return-value]


@router.patch("/chat/rooms/{room_id}", response_model=ChatRoomPublic)
async def update_room(
    room_id: uuid.UUID,
    body: ChatRoomUpdate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatRoomPublic:
    """Update room metadata."""
    repo = ChatRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    room = await repo.get_room_or_404(room_id)
    update_data = body.model_dump(exclude_unset=True)
    room = await repo.update_room(room, update_data)
    return room  # type: ignore[return-value]


@router.delete("/chat/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Delete a room (admin-only)."""
    repo = ChatRepository(session)
    await repo.require_room_admin(room_id, current_user.id)
    room = await repo.get_room_or_404(room_id)

    msg_ids_result = await session.execute(
        select(ChatMessage.id).where(ChatMessage.room_id == room_id)
    )
    message_ids = msg_ids_result.scalars().all()
    if message_ids:
        from app.models.chat import ChatAttachment
        att_result = await session.execute(
            select(ChatAttachment).where(
                ChatAttachment.message_id.in_(message_ids)  # type: ignore[arg-type]
            )
        )
        for att in att_result.scalars().all():
            await session.delete(att)
        msg_result = await session.execute(
            select(ChatMessage).where(
                ChatMessage.id.in_(message_ids)  # type: ignore[arg-type]
            )
        )
        for msg in msg_result.scalars().all():
            await session.delete(msg)
    mem_result = await session.execute(
        select(ChatMember).where(ChatMember.room_id == room_id)
    )
    for mem in mem_result.scalars().all():
        await session.delete(mem)
    await session.delete(room)


@router.get("/chat/unread-count", response_model=ChatUnreadCountPublic)
async def get_unread_count(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatUnreadCountPublic:
    """Return total unread message count across all rooms."""
    repo = ChatRepository(session)
    count = await repo.get_total_unread_count(current_user.id)
    return ChatUnreadCountPublic(count=count)


@router.post("/chat/rooms/{room_id}/mark-read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_room_read(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Mark all messages in a room as read for the current user."""
    repo = ChatRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    await repo.mark_room_as_read(room_id, current_user.id)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/chat/rooms/{room_id}/members", response_model=list[ChatMemberWithUserPublic])
async def list_members(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[ChatMemberWithUserPublic]:
    """List members of a room (member-only)."""
    repo = ChatRepository(session)
    user_repo = UserRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    members = await repo.list_members(room_id)
    user_ids = [m.user_id for m in members]
    users = await user_repo.list_by_ids(user_ids)
    by_id = {u.id: u for u in users}
    return [
        ChatMemberWithUserPublic(
            room_id=m.room_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            left_at=m.left_at,
            email=by_id[m.user_id].email if m.user_id in by_id else None,
            full_name=by_id[m.user_id].full_name if m.user_id in by_id else None,
        )
        for m in members
    ]


@router.post(
    "/chat/rooms/{room_id}/members",
    response_model=ChatMemberWithUserPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    room_id: uuid.UUID,
    body: ChatMemberAdd,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatMemberWithUserPublic:
    """Add member to room (admin-only)."""
    repo = ChatRepository(session)
    user_repo = UserRepository(session)
    await repo.require_room_admin(room_id, current_user.id)
    room = await repo.get_room_or_404(room_id)
    u = await user_repo.get_or_404(body.user_id)
    if u.company_id != room.company_id:
        raise HTTPException(422, "User must be in same company as room")

    existing = await repo.get_member(room_id, body.user_id)
    if existing and existing.left_at is None:
        raise HTTPException(409, "User is already a member")
    if existing and existing.left_at is not None:
        existing.left_at = None
        existing.role = body.role
        session.add(existing)
        await session.flush()
        m = existing
    else:
        m = await repo.add_member(room_id, body.user_id, body.role)

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
async def remove_member(
    room_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Remove a member from a room (admin-only)."""
    repo = ChatRepository(session)
    await repo.require_room_admin(room_id, current_user.id)
    m = await repo.get_member(room_id, user_id)
    if not m:
        raise HTTPException(404, "Member not found")
    await session.delete(m)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.get("/chat/rooms/{room_id}/messages", response_model=list[ChatMessagePublic])
async def list_messages(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
    before_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
) -> list[ChatMessagePublic]:
    """List message history in a room (member-only)."""
    repo = ChatRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    messages = await repo.list_messages(room_id, before_id, limit)
    attachments_by_msg = await repo.list_attachments_for_messages(
        [m.id for m in messages]
    )
    return [
        ChatMessagePublic(
            id=m.id,
            room_id=m.room_id,
            sender_id=m.sender_id,
            message_type=m.message_type,
            content=m.content,
            created_at=m.created_at,
            attachments=[
                ChatAttachmentPublic(
                    id=a.id,
                    message_id=a.message_id,
                    filename=a.filename,
                    mime_type=a.mime_type,
                    size_bytes=a.size_bytes,
                    public_url=a.public_url,
                    created_at=a.created_at,
                )
                for a in attachments_by_msg.get(m.id, [])
            ],
        )
        for m in messages
    ]


@router.post(
    "/chat/rooms/{room_id}/messages",
    response_model=ChatMessagePublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_message(
    room_id: uuid.UUID,
    body: ChatMessageCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> ChatMessagePublic:
    """Send a text message (member-only); notifies + pushes to other members."""
    await _require_can_post(session, room_id, current_user)
    service = ChatService(session)
    msg = await service.send_message(room_id, body.content, current_user)
    return msg  # type: ignore[return-value]


async def _require_can_post(
    session: AsyncSessionDep, room_id: uuid.UUID, current_user: CurrentUser
) -> None:
    """Phòng Thông báo chung: chỉ quản lý (company-wide scope) được gửi."""
    room = await ChatRepository(session).get_room_or_404(room_id)
    if room.room_type == ANNOUNCEMENT_ROOM_TYPE:
        if not await has_company_wide_scope(session, current_user, room.company_id):
            raise HTTPException(403, "Chỉ quản lý được gửi vào phòng Thông báo chung")


@router.post(
    "/chat/rooms/{room_id}/attachments",
    response_model=ChatAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    room_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> ChatAttachmentPublic:
    """Upload an attachment and create a file-message in the room."""
    repo = ChatRepository(session)
    await repo.require_active_member(room_id, current_user.id)
    await _require_can_post(session, room_id, current_user)
    try:
        stored = await _storage.save_upload(file)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    msg = await repo.create_message({
        "room_id": room_id,
        "sender_id": current_user.id,
        "message_type": "file",
        "content": None,
    })
    att = await repo.create_attachment({
        "message_id": msg.id,
        "filename": file.filename,
        "mime_type": file.content_type,
        "size_bytes": stored.size_bytes,
        "storage_path": stored.storage_path,
        "public_url": stored.public_url,
    })

    # Notify + push to other members (same path as text messages)
    await ChatService(session).notify_room_of_message(
        room_id, current_user, "Đã gửi một tệp đính kèm"
    )

    att_public = ChatAttachmentPublic(
        id=att.id,
        message_id=att.message_id,
        filename=att.filename,
        mime_type=att.mime_type,
        size_bytes=att.size_bytes,
        public_url=att.public_url,
        created_at=att.created_at,
    )

    # Broadcast to live sockets so other members see the file in real time
    # (fanout reaches only clients subscribed to the room; offline members
    # still get the in-app notification + push above).
    await chat_fanout.publish(
        room_id,
        {
            "type": "message.new",
            "message": {
                "id": str(msg.id),
                "room_id": str(msg.room_id),
                "sender_id": str(msg.sender_id),
                "sender_name": current_user.full_name
                or current_user.email
                or str(msg.sender_id),
                "message_type": msg.message_type,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "attachments": [
                    {
                        "id": str(att_public.id),
                        "message_id": str(att_public.message_id),
                        "filename": att_public.filename,
                        "mime_type": att_public.mime_type,
                        "size_bytes": att_public.size_bytes,
                        "public_url": att_public.public_url,
                        "created_at": att_public.created_at.isoformat()
                        if att_public.created_at
                        else None,
                    }
                ],
            },
        },
    )

    return att_public
