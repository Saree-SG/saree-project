"""Chat WebSocket router — realtime messaging with async session.

The endpoint is multiplexed: a single WebSocket carries traffic for any
number of rooms the client subscribes to. Connections are tracked by a
server-generated `connection_id`, not `user_id`, so concurrent connections
from the same user (multiple tabs, devices, or reconnect races) cannot
evict each other.
"""

from __future__ import annotations

import asyncio
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

# Server-side heartbeat windows. If the client sends nothing for
# RECV_TIMEOUT_S, server pings; another RECV_TIMEOUT_S of silence closes
# the socket. Two windows (≈90s total) tolerate brief network blips while
# still reaping zombies left behind by iOS PWA suspends.
RECV_TIMEOUT_S = 45.0


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


def _parse_room_id(raw: Any) -> uuid.UUID | None:
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        return None


@router.websocket("/chat/ws")
async def chat_ws(
    websocket: WebSocket,
    session_factory=Depends(get_ws_session_factory),
) -> None:
    """Multiplexed chat WebSocket.

    Per-message writes use short-lived sessions so each message commits
    immediately and is visible to other connections.
    """
    # Accept immediately so the handshake completes on the client side.
    # Auth is done right after; any failure closes with 4403.
    await websocket.accept()

    try:
        async with session_factory() as auth_session:
            async with auth_session.begin():
                current_user = await get_current_user_from_ws(websocket, auth_session)
    except HTTPException as e:
        await websocket.close(code=4403, reason=str(e.detail))
        return

    connection_id = await chat_manager.connect(websocket, user_id=current_user.id)

    async def send_self(payload: dict[str, Any]) -> None:
        await chat_manager.send_to_connection(connection_id, payload)

    awaiting_pong = False

    try:
        while True:
            try:
                data: dict[str, Any] = await asyncio.wait_for(
                    websocket.receive_json(), timeout=RECV_TIMEOUT_S
                )
            except asyncio.TimeoutError:
                if awaiting_pong:
                    # Second strike — peer is gone.
                    await websocket.close(code=1011, reason="heartbeat timeout")
                    return
                awaiting_pong = True
                await send_self({"type": "server_ping"})
                continue

            awaiting_pong = False
            msg_type = data.get("type")

            if msg_type == "ping":
                await send_self({"type": "pong"})
                continue

            if msg_type == "pong":
                # Client responded to a server_ping — heartbeat already reset.
                continue

            if msg_type == "subscribe":
                room_id = _parse_room_id(data.get("room_id"))
                if not room_id:
                    await send_self({"type": "error", "code": "BAD_ROOM", "detail": "invalid room_id"})
                    continue
                try:
                    async with session_factory() as s:
                        async with s.begin():
                            await ChatRepository(s).require_active_member(room_id, current_user.id)
                except HTTPException as e:
                    await send_self({
                        "type": "error",
                        "code": "FORBIDDEN",
                        "detail": str(e.detail),
                        "room_id": str(room_id),
                    })
                    continue
                await chat_manager.subscribe(connection_id, room_id)
                await chat_fanout.ensure_room_listener(room_id)
                await send_self({"type": "subscribed", "room_id": str(room_id)})
                await chat_fanout.publish(
                    room_id,
                    {"type": "presence.join", "room_id": str(room_id), "user_id": str(current_user.id)},
                )
                continue

            if msg_type == "unsubscribe":
                room_id = _parse_room_id(data.get("room_id"))
                if not room_id:
                    await send_self({"type": "error", "code": "BAD_ROOM", "detail": "invalid room_id"})
                    continue
                await chat_manager.unsubscribe(connection_id, room_id)
                await send_self({"type": "unsubscribed", "room_id": str(room_id)})
                await chat_fanout.publish(
                    room_id,
                    {"type": "presence.leave", "room_id": str(room_id), "user_id": str(current_user.id)},
                )
                remaining = await chat_manager.room_connection_count(room_id)
                await chat_fanout.maybe_stop_room_listener(room_id, remaining)
                continue

            if msg_type == "message.send":
                room_id = _parse_room_id(data.get("room_id"))
                if not room_id:
                    await send_self({"type": "error", "code": "BAD_ROOM", "detail": "invalid room_id"})
                    continue
                content = (data.get("content") or "").strip()
                if not content:
                    await send_self({"type": "error", "code": "EMPTY", "detail": "content is required"})
                    continue
                try:
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
                except HTTPException as e:
                    await send_self({
                        "type": "error",
                        "code": "FORBIDDEN",
                        "detail": str(e.detail),
                        "room_id": str(room_id),
                    })
                    continue

                await chat_fanout.publish(
                    room_id,
                    {
                        "type": "message.new",
                        "message": {
                            "id": str(m.id),
                            "room_id": str(m.room_id),
                            "sender_id": str(m.sender_id),
                            "sender_name": current_user.full_name or current_user.email or str(m.sender_id),
                            "message_type": m.message_type,
                            "content": m.content,
                            "created_at": m.created_at.isoformat() if m.created_at else None,
                        },
                    },
                )
                continue

            await send_self({"type": "error", "code": "UNSUPPORTED", "detail": "Unsupported message type"})
    except WebSocketDisconnect:
        pass
    finally:
        conn = await chat_manager.disconnect(connection_id)
        if conn:
            for room_id in list(conn.subscribed_rooms):
                await chat_fanout.publish(
                    room_id,
                    {"type": "presence.leave", "room_id": str(room_id), "user_id": str(current_user.id)},
                )
                remaining = await chat_manager.room_connection_count(room_id)
                await chat_fanout.maybe_stop_room_listener(room_id, remaining)
