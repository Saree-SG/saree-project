"""
DEPRECATED: This file is kept for backward compatibility.
All models have been moved to app/models/ (domain-based folder).
Import from app.models instead.
"""
# Re-export everything from the new package so existing imports still work.
from app.models import *  # noqa: F401, F403
from app.models.schemas import Message, NewPassword, Token, TokenPayload  # noqa: F401
from app.models.user import (  # noqa: F401
    UpdatePassword,
    User,
    UserBase,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
    get_datetime_utc,
)
