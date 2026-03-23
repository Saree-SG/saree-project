"""Transactional decorators for async service calls."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any, TypeVar

from app.core.database.context import get_current_session
from app.core.database.uow import AsyncUnitOfWork

F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


def transactional(raise_on_error: bool = True) -> Callable[[F], F]:
    """Wrap async function in UoW when no ambient session exists."""

    def _decorator(func: F) -> F:
        """Build wrapped callable."""

        @wraps(func)
        async def _wrapped(*args: Any, **kwargs: Any):
            """Execute wrapped function with transactional scope."""

            if get_current_session() is not None:
                return await func(*args, **kwargs)
            try:
                async with AsyncUnitOfWork():
                    return await func(*args, **kwargs)
            except Exception:
                if raise_on_error:
                    raise
                return None

        return _wrapped  # type: ignore[return-value]

    return _decorator
