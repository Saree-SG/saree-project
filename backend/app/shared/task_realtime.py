"""In-process WebSocket fan-out for task-scoped realtime events (single-node POC)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class TaskConnectionManager:
    """Track WebSocket subscribers per task id and broadcast JSON text payloads."""

    def __init__(self) -> None:
        """Initialize empty subscriber registry."""
        self._by_task: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, task_id: str, websocket: WebSocket) -> None:
        """Accept the socket and register it for ``task_id``."""
        await websocket.accept()
        async with self._lock:
            self._by_task.setdefault(task_id, set()).add(websocket)

    async def disconnect(self, task_id: str, websocket: WebSocket) -> None:
        """Remove a socket from ``task_id`` and prune empty buckets."""
        async with self._lock:
            bucket = self._by_task.get(task_id)
            if not bucket:
                return
            bucket.discard(websocket)
            if not bucket:
                self._by_task.pop(task_id, None)

    async def broadcast(self, task_id: str, message: str) -> None:
        """Send ``message`` to all subscribers; drop broken connections."""
        async with self._lock:
            targets = list(self._by_task.get(task_id, set()))
        dead: list[tuple[str, WebSocket]] = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append((task_id, ws))
        for tid, ws in dead:
            await self.disconnect(tid, ws)


task_ws_manager = TaskConnectionManager()


class UserTaskConnectionManager:
    """Track WebSocket subscribers per user id and broadcast JSON text payloads."""

    def __init__(self) -> None:
        """Initialize empty subscriber registry."""
        self._by_user: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Accept the socket and register it for ``user_id``."""
        await websocket.accept()
        async with self._lock:
            self._by_user.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Remove a socket from ``user_id`` and prune empty buckets."""
        async with self._lock:
            bucket = self._by_user.get(user_id)
            if not bucket:
                return
            bucket.discard(websocket)
            if not bucket:
                self._by_user.pop(user_id, None)

    async def broadcast(self, user_id: str, message: str) -> None:
        """Send ``message`` to all subscribers; drop broken connections."""
        async with self._lock:
            targets = list(self._by_user.get(user_id, set()))
        dead: list[tuple[str, WebSocket]] = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append((user_id, ws))
        for uid, ws in dead:
            await self.disconnect(uid, ws)


task_user_ws_manager = UserTaskConnectionManager()


async def broadcast_task_event(task_id: str, event: str, data: dict[str, Any]) -> None:
    """Serialize one task event and push it to all listeners on ``task_id``."""
    payload = json.dumps(
        {"event": event, "task_id": task_id, "data": data},
        default=str,
    )
    await task_ws_manager.broadcast(task_id, payload)


async def broadcast_task_user_event(user_id: str, event: str, task_id: str, data: dict[str, Any]) -> None:
    """Serialize one task event and push it to all listeners of ``user_id``."""
    payload = json.dumps(
        {"event": event, "task_id": task_id, "data": data},
        default=str,
    )
    await task_user_ws_manager.broadcast(user_id, payload)


async def run_task_ws_receive_loop(
    task_id: str,
    websocket: WebSocket,
) -> None:
    """Handle ping/pong keepalive until the client disconnects."""
    try:
        while True:
            data = await websocket.receive_text()
            if data.strip() == "ping":
                try:
                    await websocket.send_text("pong")
                except Exception:
                    return
    except (WebSocketDisconnect, Exception):
        return
