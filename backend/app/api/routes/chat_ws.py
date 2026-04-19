"""Chat WebSocket router — realtime messaging with async session."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_ws_session_factory
from app.core.auth.security import decode_token
from app.core.auth.session_service import get_session_service
from app.models.user import User
from app.repositories.chat_repository import ChatRepository
from app.repositories.user_repository import UserRepository
from app.shared.chat_realtime import chat_fanout, chat_manager

router = APIRouter(tags=["chat"])


async def get_current_user_from_ws(
    websocket: WebSocket, session: AsyncSession
) -> User:
    """Authenticate websocket via Bearer header or `token` query param."""
    auth = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
    else:
        token = websocket.query_params.get("token", "").strip()
        if not token:
            raise HTTPException(403, "Missing auth token (Bearer header or token query param)")
    token_data = decode_token(token)
    if token_data.typ and token_data.typ != "access":
        raise HTTPException(403, "Invalid token type")
    if not get_session_service().validate_access_payload(token_data):
        raise HTTPException(401, "Session revoked or expired")
    user_repo = UserRepository(session)
    user = await user_repo.get_by_id(token_data.sub)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.is_active:
        raise HTTPException(400, "Inactive user")
    return user


@router.websocket("/chat/ws")
async def chat_ws(
    websocket: WebSocket,
    room_id: uuid.UUID,
    session_factory=Depends(get_ws_session_factory),
) -> None:
    """WebSocket endpoint for a single chat room.

    Uses a dedicated short-lived session per message write so that each
    message is committed immediately and visible to other connections.
    A long-lived request-scoped transaction is not appropriate here.
    """
    async with session_factory() as auth_session:
        async with auth_session.begin():
            try:
                current_user = await get_current_user_from_ws(websocket, auth_session)
                chat_repo = ChatRepository(auth_session)
                await chat_repo.require_active_member(room_id, current_user.id)
            except HTTPException as e:
                await websocket.close(code=4403, reason=str(e.detail))
                return

    await chat_manager.connect(websocket, room_id=room_id, user_id=current_user.id)
    await chat_fanout.ensure_room_listener(room_id)
    await chat_fanout.publish(
        room_id,
        {"type": "presence.join", "room_id": str(room_id), "user_id": str(current_user.id)},
    )

    try:
        while True:
            data: dict[str, Any] = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await chat_manager.send_json(room_id, current_user.id, {"type": "pong"})
                continue
            if msg_type != "message.send":
                await chat_manager.send_json(
                    room_id,
                    current_user.id,
                    {"type": "error", "code": "UNSUPPORTED", "detail": "Unsupported message type"},
                )
                continue

            content = (data.get("content") or "").strip()
            if not content:
                await chat_manager.send_json(
                    room_id,
                    current_user.id,
                    {"type": "error", "code": "EMPTY", "detail": "content is required"},
                )
                continue

            async with session_factory() as msg_session:
                async with msg_session.begin():
                    msg_repo = ChatRepository(msg_session)
                    await msg_repo.require_active_member(room_id, current_user.id)
                    m = await msg_repo.create_message({
                        "room_id": room_id,
                        "sender_id": current_user.id,
                        "message_type": "text",
                        "content": content,
                    })

            await chat_fanout.publish(
                room_id,
                {
                    "type": "message.new",
                    "message": {
                        "id": str(m.id),
                        "room_id": str(m.room_id),
                        "sender_id": str(m.sender_id),
                        "message_type": m.message_type,
                        "content": m.content,
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                    },
                },
            )
    except WebSocketDisconnect:
        pass
    finally:
        await chat_manager.disconnect(room_id, current_user.id)
        remaining = await chat_manager.room_connection_count(room_id)
        await chat_fanout.maybe_stop_room_listener(room_id, remaining)
        await chat_fanout.publish(
            room_id,
            {"type": "presence.leave", "room_id": str(room_id), "user_id": str(current_user.id)},
        )
