"""User service — auth and profile business logic."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash, verify_password
from app.models.user import (
    UpdatePassword,
    User,
    UserCreate,
    UserPublic,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.repositories.user_repository import UserRepository


class UserService:
    """Orchestrates user management operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind service to async session."""
        self._session = session
        self._user_repo = UserRepository(session)

    async def list_users(self, skip: int = 0, limit: int = 100) -> UsersPublic:
        """Return paginated user list."""
        users, total = await self._user_repo.list_paginated(skip=skip, limit=limit)
        return UsersPublic(data=list(users), count=total)

    async def get_by_email(self, email: str) -> User | None:
        """Return user by email."""
        return await self._user_repo.get_by_email(email)

    async def get_or_404(self, user_id: uuid.UUID) -> User:
        """Return user or raise 404."""
        return await self._user_repo.get_or_404(user_id)

    async def create_user(self, user_in: UserCreate) -> UserPublic:
        """Create a new user with hashed password."""
        existing = await self._user_repo.get_by_email(user_in.email)
        if existing:
            raise HTTPException(
                status_code=400,
                detail="The user with this email already exists in the system",
            )
        data = user_in.model_dump()
        data["hashed_password"] = get_password_hash(user_in.password)
        data.pop("password", None)
        user = await self._user_repo.create_user(data)
        return UserPublic(**user.model_dump())

    async def update_me(
        self, current_user: User, body: UserUpdateMe
    ) -> UserPublic:
        """Update profile fields for the authenticated user."""
        update_data = body.model_dump(exclude_unset=True)
        if "email" in update_data:
            existing = await self._user_repo.get_by_email(update_data["email"])
            if existing and existing.id != current_user.id:
                raise HTTPException(409, "User with this email already exists")
        user = await self._user_repo.update_user(current_user, update_data)
        return UserPublic(**user.model_dump())

    async def update_password(
        self, current_user: User, body: UpdatePassword
    ) -> None:
        """Change password for the authenticated user."""
        verified, _ = verify_password(body.current_password, current_user.hashed_password)
        if not verified:
            raise HTTPException(400, "Incorrect password")
        if body.current_password == body.new_password:
            raise HTTPException(400, "New password cannot be the same as the current one")
        await self._user_repo.update_user(
            current_user,
            {"hashed_password": get_password_hash(body.new_password)},
        )

    async def update_user_admin(
        self, user_id: uuid.UUID, user_in: UserUpdate
    ) -> UserPublic:
        """Admin update of any user."""
        user = await self._user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="The user with this id does not exist in the system",
            )
        data = user_in.model_dump(exclude_unset=True)
        if "email" in data:
            existing = await self._user_repo.get_by_email(data["email"])
            if existing and existing.id != user.id:
                raise HTTPException(409, "User with this email already exists")
        if "password" in data:
            data["hashed_password"] = get_password_hash(data.pop("password"))
        user = await self._user_repo.update_user(user, data)
        return UserPublic(**user.model_dump())

    async def delete_user(self, user_id: uuid.UUID, current_user: User) -> None:
        """Delete a user (superuser only; cannot self-delete)."""
        if current_user.is_superuser and current_user.id == user_id:
            raise HTTPException(403, "Super users are not allowed to delete themselves")
        user = await self._user_repo.get_or_404(user_id)
        await self._session.delete(user)

    async def authenticate(self, email: str, password: str) -> User | None:
        """Return user if credentials are valid; constant-time on miss."""
        from app.crud import DUMMY_HASH
        user = await self._user_repo.get_by_email(email)
        if not user:
            verify_password(password, DUMMY_HASH)
            return None
        verified, updated_hash = verify_password(password, user.hashed_password)
        if not verified:
            return None
        if updated_hash:
            await self._user_repo.update_user(user, {"hashed_password": updated_hash})
        return user
