"""
Event Bus — lightweight in-process pub/sub.

Usage:
    from app.shared.event_bus import event_bus

    # Emit
    await event_bus.emit("task.completed", {"task_id": str(task.id)})

    # Subscribe (at module startup)
    @event_bus.on("task.completed")
    async def handle_task_done(payload: dict):
        ...

Scale path: swap _listeners dict with Redis Pub/Sub when running multiple workers.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Callable, Awaitable

logger = logging.getLogger(__name__)

Handler = Callable[[dict], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._listeners: dict[str, list[Handler]] = defaultdict(list)

    def on(self, event: str) -> Callable[[Handler], Handler]:
        """Decorator to register an async listener."""
        def decorator(fn: Handler) -> Handler:
            self._listeners[event].append(fn)
            return fn
        return decorator

    async def emit(self, event: str, payload: dict | None = None) -> None:
        """Fire event — calls all listeners concurrently."""
        listeners = self._listeners.get(event, [])
        if not listeners:
            return
        results = await asyncio.gather(
            *[listener(payload or {}) for listener in listeners],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.error("EventBus handler error for '%s': %s", event, r)


# Singleton — import this everywhere
event_bus = EventBus()
