"""Generic async repository utilities."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, select

T = TypeVar("T", bound=SQLModel)


class BaseRepository(Generic[T]):
    """Base async repository with reusable CRUD helpers."""

    def __init__(self, model_type: type[T], session: AsyncSession) -> None:
        """Initialize repository with model class and session."""

        self._model_type = model_type
        self._session = session

    async def add_record(self, data: dict[str, Any]) -> T:
        """Create and persist a model record."""

        record = self._model_type.model_validate(data)
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def get_by_id(self, record_id: Any) -> T | None:
        """Fetch record by primary key."""

        return await self._session.get(self._model_type, record_id)

    async def update_record(self, record: T, data: dict[str, Any]) -> T:
        """Update record fields and persist."""

        record.sqlmodel_update(data)
        self._session.add(record)
        await self._session.flush()
        await self._session.refresh(record)
        return record

    async def remove_record(self, record: T) -> None:
        """Delete record from persistence."""

        await self._session.delete(record)

    async def list_records(self, limit: int = 100, offset: int = 0) -> list[T]:
        """List records with offset-limit pagination."""

        query = select(self._model_type).offset(offset).limit(limit)
        return list((await self._session.exec(query)).all())
