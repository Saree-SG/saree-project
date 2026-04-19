"""
FastAPI dependency injectors.

AsyncSessionDep  → inject AsyncSession into async routes (main path)
SessionDep       → inject sync Session (kept for WebSocket / legacy helpers)
CurrentUser      → resolved async user from JWT
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session

from app.core.auth.security import decode_token
from app.core.auth.session_service import get_session_service
from app.core.database.engine import AsyncSessionFactory, sync_engine
from app.models import User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl="/api/v1/login/access-token"
)


# ---------------------------------------------------------------------------
# Async session (FastAPI routes)
# ---------------------------------------------------------------------------

async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session wrapped in a single request-scoped transaction.

    One transaction per request:
    - On success the `async with session.begin()` block commits automatically.
    - On any exception it rolls back automatically.

    Services and repositories MUST NOT call session.commit() or session.begin();
    they should only call session.flush() for within-request visibility.
    """

    async with AsyncSessionFactory() as session:
        async with session.begin():
            yield session


AsyncSessionDep = Annotated[AsyncSession, Depends(get_async_db)]


def get_ws_session_factory():
    """Return the async session factory callable for WebSocket per-message sessions.

    Exists as a dependency so tests can override it to use a test-schema factory
    rather than the production one.
    """
    return AsyncSessionFactory


# ---------------------------------------------------------------------------
# Sync session (WebSocket / legacy)
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """Yield a sync session (for WebSocket & backward-compat)."""
    with Session(sync_engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]

TokenDep = Annotated[str, Depends(reusable_oauth2)]


# ---------------------------------------------------------------------------
# Auth dependencies (async)
# ---------------------------------------------------------------------------

async def get_current_user(
    session: AsyncSessionDep,
    token: TokenDep,
) -> User:
    """Resolve and validate current user from JWT (async)."""
    try:
        token_data = decode_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    if token_data.typ and token_data.typ != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type"
        )
    if not get_session_service().validate_access_payload(token_data):
        raise HTTPException(status_code=401, detail="Session revoked or expired")

    user = await session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    """Raise 403 if current user is not superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
