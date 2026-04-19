"""User management routes — full async, delegated to UserService."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser, get_current_active_superuser
from app.core.config import settings
from app.models import (
    Message,
    UpdatePassword,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
from app.services.user_service import UserService
from app.utils import generate_new_account_email, send_email

router = APIRouter(prefix="/users", tags=["users"])


def _svc(session: AsyncSession) -> UserService:
    """Build a UserService bound to the request session."""
    return UserService(session)


@router.get("/by-email", response_model=UserPublic)
async def read_user_by_email(
    email: str,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> Any:
    """Lookup a user by email (same-company only unless superuser)."""
    user = await _svc(session).get_by_email(email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.is_superuser:
        return user
    if current_user.company_id is None or user.company_id is None:
        raise HTTPException(status_code=403, detail="Company scope required")
    if current_user.company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    return user


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UsersPublic,
)
async def read_users(session: AsyncSessionDep, skip: int = 0, limit: int = 100) -> Any:
    """Retrieve users (superuser only)."""
    return await _svc(session).list_users(skip=skip, limit=limit)


@router.post(
    "/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic
)
async def create_user(session: AsyncSessionDep, user_in: UserCreate) -> Any:
    """Create new user (superuser only)."""
    user = await _svc(session).create_user(user_in)
    if settings.emails_enabled and user_in.email:
        email_data = generate_new_account_email(
            email_to=user_in.email, username=user_in.email, password=user_in.password
        )
        send_email(
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.patch("/me", response_model=UserPublic)
async def update_user_me(
    session: AsyncSessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    """Update own profile."""
    return await _svc(session).update_me(current_user, user_in)


@router.patch("/me/password", response_model=Message)
async def update_password_me(
    session: AsyncSessionDep, body: UpdatePassword, current_user: CurrentUser
) -> Any:
    """Update own password."""
    await _svc(session).update_password(current_user, body)
    return Message(message="Password updated successfully")


@router.get("/me", response_model=UserPublic)
async def read_user_me(current_user: CurrentUser) -> Any:
    """Get current user info."""
    return current_user


@router.delete("/me", response_model=Message)
async def delete_user_me(session: AsyncSessionDep, current_user: CurrentUser) -> Any:
    """Delete own account (non-superuser only)."""
    if current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="Super users are not allowed to delete themselves"
        )
    await _svc(session).delete_user(current_user.id, current_user)
    return Message(message="User deleted successfully")


@router.post("/signup", response_model=UserPublic)
async def register_user(session: AsyncSessionDep, user_in: UserRegister) -> Any:
    """Self-registration (if allowed)."""
    from app.models.user import UserCreate as UC
    return await _svc(session).create_user(UC.model_validate(user_in))


@router.get("/{user_id}", response_model=UserPublic)
async def read_user_by_id(
    user_id: uuid.UUID, session: AsyncSessionDep, current_user: CurrentUser
) -> Any:
    """Get a specific user by ID."""
    if not current_user.is_superuser and user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return await _svc(session).get_or_404(user_id)


@router.patch(
    "/{user_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=UserPublic,
)
async def update_user(
    user_id: uuid.UUID, user_in: UserUpdate, session: AsyncSessionDep
) -> Any:
    """Update any user (superuser only)."""
    return await _svc(session).update_user_admin(user_id, user_in)


@router.delete("/{user_id}", dependencies=[Depends(get_current_active_superuser)])
async def delete_user(
    user_id: uuid.UUID, session: AsyncSessionDep, current_user: CurrentUser
) -> Message:
    """Delete a user (superuser only)."""
    await _svc(session).delete_user(user_id, current_user)
    return Message(message="User deleted successfully")
