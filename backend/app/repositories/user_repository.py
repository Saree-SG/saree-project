"""User domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.user import User


class UserRepository(BaseRepository[User]):
    """Async repository for User entity."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to User model and session."""
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> User | None:
        """Return user by email or None."""
        result = await self._execute(select(User).where(User.email == email))
        return result.scalars().first()

    async def get_or_404(self, user_id: uuid.UUID) -> User:
        """Return user or raise 404."""
        user = await self.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    async def list_paginated(
        self, skip: int = 0, limit: int = 100
    ) -> tuple[Sequence[User], int]:
        """Return users with total count for pagination."""
        count_result = await self._execute(select(func.count()).select_from(User))
        total: int = count_result.scalar_one()

        stmt = select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
        result = await self._execute(stmt)
        return result.scalars().all(), total

    async def list_by_ids(self, user_ids: list[uuid.UUID]) -> Sequence[User]:
        """Batch-load users by ID list (avoids N+1 queries)."""
        if not user_ids:
            return []
        result = await self._execute(
            select(User).where(User.id.in_(user_ids))  # type: ignore[arg-type]
        )
        return result.scalars().all()

    async def create_user(self, data: dict) -> User:
        """Insert a new user record."""
        user = User.model_validate(data)
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def update_user(self, user: User, data: dict) -> User:
        """Apply partial update to user; flush and refresh."""
        user.sqlmodel_update(data)
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def list_by_company(self, company_id: uuid.UUID) -> Sequence[User]:
        """Return all active users in a company."""
        result = await self._execute(
            select(User).where(User.company_id == company_id, User.is_active == True)  # noqa: E712
        )
        return result.scalars().all()
