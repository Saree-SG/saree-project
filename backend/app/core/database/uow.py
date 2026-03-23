"""Async Unit Of Work abstraction."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database.context import reset_current_session, set_current_session


class AsyncUnitOfWork:
    """Async unit of work using context-managed session lifecycle."""

    def __init__(self) -> None:
        """Initialize async engine and session factory."""

        sync_url = str(settings.SQLALCHEMY_DATABASE_URI)
        async_url = sync_url.replace("postgresql+psycopg", "postgresql+asyncpg")
        self._engine = create_async_engine(async_url, future=True)
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        self.session: AsyncSession | None = None
        self._ctx_token = None

    async def __aenter__(self) -> "AsyncUnitOfWork":
        """Open async session and bind it to context."""

        self.session = self._session_factory()
        self._ctx_token = set_current_session(self.session)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        """Commit or rollback based on exception presence."""

        if self.session is None:
            return
        try:
            if exc is None:
                await self.session.commit()
            else:
                await self.session.rollback()
        finally:
            await self.session.close()
            if self._ctx_token is not None:
                reset_current_session(self._ctx_token)
