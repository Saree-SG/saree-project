"""Context variables for async DB sessions."""

from __future__ import annotations

from contextvars import ContextVar

from sqlalchemy.ext.asyncio import AsyncSession

_session_ctx: ContextVar[AsyncSession | None] = ContextVar("db_session_ctx", default=None)


def get_current_session() -> AsyncSession | None:
    """Return current async session from context."""

    return _session_ctx.get()


def set_current_session(session: AsyncSession | None):
    """Set current async session into context."""

    return _session_ctx.set(session)


def reset_current_session(token) -> None:
    """Reset context session using context token."""

    _session_ctx.reset(token)
