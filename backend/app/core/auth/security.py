"""JWT utilities for access and refresh tokens."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import settings
from app.models.schemas import TokenPayload

ALGORITHM = "HS256"


def _build_exp(expires_delta: timedelta) -> datetime:
    """Build expiration datetime in UTC."""

    return datetime.now(timezone.utc) + expires_delta


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta,
    session_id: str | None = None,
    jti: str | None = None,
) -> str:
    """Create signed access token with optional session claims."""

    to_encode = {
        "exp": _build_exp(expires_delta),
        "sub": str(subject),
        "typ": "access",
        "jti": jti or str(uuid4()),
    }
    if session_id is not None:
        to_encode["sid"] = session_id
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(
    subject: str | Any,
    expires_delta: timedelta,
    session_id: str,
    jti: str | None = None,
) -> str:
    """Create signed refresh token bound to a session id."""

    to_encode = {
        "exp": _build_exp(expires_delta),
        "sub": str(subject),
        "typ": "refresh",
        "sid": session_id,
        "jti": jti or str(uuid4()),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenPayload:
    """Decode and validate JWT token payload."""

    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    return TokenPayload(**payload)


def try_decode_token(token: str) -> TokenPayload | None:
    """Decode JWT and return None on invalid token."""

    try:
        return decode_token(token)
    except (InvalidTokenError, ValueError):
        return None
