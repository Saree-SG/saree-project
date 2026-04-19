"""
Transactional decorator for async service / Celery helpers.

@transactional(raise_on_error=True)
async def some_operation(session: AsyncSession, ...) -> ...:
    ...

When an ambient session already exists in context (e.g. inside a FastAPI
request that already opened a UoW), the decorator is a no-op.
When there is no ambient session it opens a new AsyncUnitOfWork.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any, TypeVar

from app.core.database.context import get_current_session
from app.core.database.uow import AsyncUnitOfWork

F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


def transactional(raise_on_error: bool = True) -> Callable[[F], F]:
    """
    Wrap an async function in a UoW transaction when no ambient session exists.

    Args:
        raise_on_error: When True (default), re-raise exceptions after rollback.
            Set False for best-effort side-effects (e.g. audit log helpers).
    """

    def _decorator(func: F) -> F:
        """Return wrapped callable."""

        @wraps(func)
        async def _wrapped(*args: Any, **kwargs: Any) -> Any:
            """Execute wrapped function inside a transaction boundary."""
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
