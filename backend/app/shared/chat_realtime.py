"""Realtime primitives for chat (connection manager, fanout helpers)."""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket

from app.core.config import settings

try:
    import redis.asyncio as redis_async
except Exception:
    redis_async = None  # type: ignore[assignment]


@dataclass(slots=True)
class ChatConnection:
    """Represents a single connected WebSocket client."""

    websocket: WebSocket
    user_id: uuid.UUID
    room_id: uuid.UUID
    send_queue: asyncio.Queue[str]
    sender_task: asyncio.Task[None]


class ChatConnectionManager:
    """Manage active room connections with backpressure protection."""

    def __init__(self, max_queue_size: int = 200) -> None:
        """Create manager with bounded per-connection send queue."""

        self._max_queue_size = max_queue_size
        self._rooms: dict[uuid.UUID, dict[uuid.UUID, ChatConnection]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, room_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Accept WS and register connection in room."""

        await websocket.accept()
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=self._max_queue_size)
        sender_task = asyncio.create_task(self._sender_loop(websocket, q))
        conn = ChatConnection(
            websocket=websocket,
            user_id=user_id,
            room_id=room_id,
            send_queue=q,
            sender_task=sender_task,
        )
        async with self._lock:
            self._rooms.setdefault(room_id, {})[user_id] = conn

    async def disconnect(self, room_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Remove connection and stop sender task."""

        async with self._lock:
            conn = self._rooms.get(room_id, {}).pop(user_id, None)
            if self._rooms.get(room_id) == {}:
                self._rooms.pop(room_id, None)
        if not conn:
            return
        conn.sender_task.cancel()
        try:
            await conn.sender_task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def room_connection_count(self, room_id: uuid.UUID) -> int:
        """Return number of active local connections for a room."""

        async with self._lock:
            return len(self._rooms.get(room_id, {}))

    async def send_json(self, room_id: uuid.UUID, user_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """Enqueue a JSON payload for a single connection."""

        msg = json.dumps(payload, default=str)
        async with self._lock:
            conn = self._rooms.get(room_id, {}).get(user_id)
        if not conn:
            return
        try:
            conn.send_queue.put_nowait(msg)
        except asyncio.QueueFull:
            await conn.websocket.close(code=1013, reason="Client too slow")

    async def broadcast_json(self, room_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """Broadcast JSON payload to all active connections in the room."""

        msg = json.dumps(payload, default=str)
        async with self._lock:
            conns = list(self._rooms.get(room_id, {}).values())
        for conn in conns:
            try:
                conn.send_queue.put_nowait(msg)
            except asyncio.QueueFull:
                await conn.websocket.close(code=1013, reason="Client too slow")

    async def _sender_loop(self, websocket: WebSocket, q: asyncio.Queue[str]) -> None:
        """Continuously send queued messages to the websocket."""

        try:
            while True:
                data = await q.get()
                try:
                    await websocket.send_text(data)
                except Exception:
                    # Socket is broken; drain remaining items so the queue
                    # doesn't block producers, then exit cleanly.
                    while not q.empty():
                        q.get_nowait()
                    return
        except asyncio.CancelledError:
            pass


chat_manager = ChatConnectionManager()


class ChatRedisFanout:
    """Redis Pub/Sub bridge for multi-node room broadcasts."""

    def __init__(self) -> None:
        """Initialize redis client lazily based on settings."""

        self._client = None
        self._room_tasks: dict[uuid.UUID, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    def enabled(self) -> bool:
        """Return True if redis fanout is configured and available."""

        return bool(settings.REDIS_URL) and redis_async is not None

    def _channel(self, room_id: uuid.UUID) -> str:
        """Return redis channel name for a room."""

        return f"chat:room:{room_id}"

    def _get_client(self):
        """Build redis client singleton."""

        if self._client is None:
            self._client = redis_async.from_url(str(settings.REDIS_URL), decode_responses=True)
        return self._client

    async def ensure_room_listener(self, room_id: uuid.UUID) -> None:
        """Start background listener for room if not already running."""

        if not self.enabled():
            return
        async with self._lock:
            if room_id in self._room_tasks:
                return
            self._room_tasks[room_id] = asyncio.create_task(self._listen_room(room_id))

    async def maybe_stop_room_listener(self, room_id: uuid.UUID, active_connections: int) -> None:
        """Stop room listener if no local connections remain."""

        if not self.enabled():
            return
        if active_connections > 0:
            return
        async with self._lock:
            task = self._room_tasks.pop(room_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

    async def publish(self, room_id: uuid.UUID, payload: dict[str, Any]) -> None:
        """Publish payload to the room channel.

        Falls back to in-process broadcast if Redis is unavailable so the
        caller never crashes due to a transient Redis failure.
        """
        if not self.enabled():
            await chat_manager.broadcast_json(room_id, payload)
            return
        await self.ensure_room_listener(room_id)
        client = self._get_client()
        try:
            await client.publish(self._channel(room_id), json.dumps(payload, default=str))
        except Exception:
            # Redis publish failed — fall back to local broadcast so at least
            # clients on this node receive the message.
            await chat_manager.broadcast_json(room_id, payload)

    async def _listen_room(self, room_id: uuid.UUID) -> None:
        """Listen for redis events for room and broadcast locally."""

        client = self._get_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(self._channel(room_id))
        try:
            async for message in pubsub.listen():
                if message is None:
                    continue
                if message.get("type") != "message":
                    continue
                raw = message.get("data")
                if not raw:
                    continue
                try:
                    payload = json.loads(raw)
                except Exception:
                    continue
                await chat_manager.broadcast_json(room_id, payload)
        finally:
            try:
                await pubsub.unsubscribe(self._channel(room_id))
            except Exception:
                pass
            try:
                await pubsub.close()
            except Exception:
                pass


chat_fanout = ChatRedisFanout()

