"""Async Unit Of Work — wraps a single async session in a transaction boundary."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.context import reset_current_session, set_current_session
from app.core.database.engine import AsyncSessionFactory


class AsyncUnitOfWork:
    """
    Async unit of work using the shared engine session factory.

    Usage (in Celery tasks or service helpers without FastAPI DI):
        async with AsyncUnitOfWork() as uow:
            result = await some_repo_method(uow.session)
    """

    def __init__(self) -> None:
        """Initialise without creating a session; session is opened on enter."""
        self.session: AsyncSession | None = None
        self._ctx_token = None

    async def __aenter__(self) -> AsyncUnitOfWork:
        """Open session, begin transaction, bind to context variable."""
        self.session = AsyncSessionFactory()
        await self.session.begin()
        self._ctx_token = set_current_session(self.session)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        """Commit on success, rollback on any exception."""
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
