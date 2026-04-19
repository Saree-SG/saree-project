"""
Base async repository — strict DB access layer.

Rules (enforced by convention):
- Routes MUST NOT call session.execute/add/delete/commit directly.
- Repositories MUST NOT call session.commit() — transaction is owned by service/UoW.
- All public methods are async and return typed results.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from sqlalchemy import func
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

T = TypeVar("T", bound=SQLModel)


class BaseRepository(Generic[T]):
    """
    Generic async CRUD helpers for a single SQLModel table entity.

    Subclasses should add domain-specific query methods and MUST NOT expose
    raw session operations to callers.
    """

    def __init__(self, model: type[T], session: AsyncSession) -> None:
        """Bind repository to a model class and an async session."""
        self._model = model
        self._session = session

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _execute(self, statement: Any) -> Any:
        """Execute a select statement and return the raw Result."""
        return await self._session.execute(statement)

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def get_by_id(self, record_id: Any) -> T | None:
        """Fetch a single record by primary key; returns None if not found."""
        return await self._session.get(self._model, record_id)

    async def list_all(self, *, limit: int = 100, offset: int = 0) -> Sequence[T]:
        """List records with offset/limit pagination."""
        stmt = sa_select(self._model).offset(offset).limit(limit)
        result = await self._execute(stmt)
        return result.scalars().all()

    async def count(self) -> int:
        """Count all rows in the table."""
        stmt = sa_select(func.count()).select_from(self._model)
        result = await self._execute(stmt)
        return result.scalar_one()

    # ------------------------------------------------------------------
    # Write helpers (NO commit — caller/UoW is responsible)
    # ------------------------------------------------------------------

    async def add(self, data: dict[str, Any]) -> T:
        """Create a new record from a dict, flush to get the generated PK."""
        record = self._model.model_validate(data)
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def save(self, record: T) -> T:
        """Persist a modified record; flush and refresh so callers see DB-generated values."""
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def delete(self, record: T) -> None:
        """Hard-delete a record (use soft_delete for auditable entities)."""
        await self._session.delete(record)
