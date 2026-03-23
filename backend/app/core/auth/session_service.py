"""Session service with optional Redis backend and refresh grace period."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import uuid4

from app.core.auth import security as auth_security
from app.core.config import settings
from app.models.schemas import Token, TokenPayload

try:
    from redis import Redis
except Exception:
    Redis = None  # type: ignore[assignment]


def _now_ts() -> int:
    """Return current unix timestamp in seconds."""

    return int(time.time())


def _sha256(value: str) -> str:
    """Build stable SHA256 hash for token keys."""

    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass
class RotateResult:
    """Result of refresh rotation flow."""

    token: Token
    reused_from_grace: bool = False


class _MemoryKV:
    """Small in-memory TTL key-value store for local fallback."""

    def __init__(self) -> None:
        """Initialize in-memory store."""

        self._data: dict[str, tuple[str, int | None]] = {}

    def setex(self, key: str, seconds: int, value: str) -> None:
        """Set key with expiration in seconds."""

        self._data[key] = (value, _now_ts() + seconds)

    def set(self, key: str, value: str) -> None:
        """Set key without expiration."""

        self._data[key] = (value, None)

    def get(self, key: str) -> str | None:
        """Get key value if not expired."""

        value = self._data.get(key)
        if value is None:
            return None
        payload, exp = value
        if exp is not None and exp <= _now_ts():
            self._data.pop(key, None)
            return None
        return payload

    def delete(self, key: str) -> None:
        """Delete key from store."""

        self._data.pop(key, None)


class SessionService:
    """Manage auth sessions and refresh token rotation."""

    def __init__(self) -> None:
        """Initialize backend storage and ttl values."""

        self._refresh_ttl = settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60
        self._grace_seconds = settings.REFRESH_GRACE_PERIOD_SECONDS
        self._kv = self._build_kv()

    def _build_kv(self) -> Any:
        """Build redis client when configured, otherwise memory fallback."""

        if settings.REDIS_URL and Redis is not None:
            return Redis.from_url(settings.REDIS_URL, decode_responses=True)
        return _MemoryKV()

    def _session_key(self, session_id: str) -> str:
        """Build session key."""

        return f"sess:{session_id}"

    def _refresh_key(self, refresh_hash: str) -> str:
        """Build refresh key."""

        return f"rt:{refresh_hash}"

    def _grace_key(self, refresh_hash: str) -> str:
        """Build grace key."""

        return f"rt_grace:{refresh_hash}"

    def _write_json_ttl(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        """Write JSON payload with TTL."""

        self._kv.setex(key, ttl_seconds, json.dumps(value))

    def _read_json(self, key: str) -> dict[str, Any] | None:
        """Read JSON payload."""

        raw = self._kv.get(key)
        if not raw:
            return None
        return json.loads(raw)

    def issue_login_tokens(self, user_id: str) -> Token:
        """Create a new session and issue access/refresh token pair."""

        session_id = str(uuid4())
        access = auth_security.create_access_token(
            subject=user_id,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            session_id=session_id,
        )
        refresh = auth_security.create_refresh_token(
            subject=user_id,
            expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
            session_id=session_id,
        )
        refresh_hash = _sha256(refresh)
        self._write_json_ttl(
            self._session_key(session_id),
            {"uid": user_id, "revoked": False},
            self._refresh_ttl,
        )
        self._write_json_ttl(
            self._refresh_key(refresh_hash),
            {"uid": user_id, "sid": session_id, "status": "active"},
            self._refresh_ttl,
        )
        return Token(
            access_token=access,
            refresh_token=refresh,
            session_id=session_id,
            token_type="bearer",
        )

    def validate_access_payload(self, payload: TokenPayload) -> bool:
        """Validate access payload against session status."""

        if payload.sid is None:
            return True
        session_state = self._read_json(self._session_key(payload.sid))
        if session_state is None:
            return False
        return not bool(session_state.get("revoked"))

    def rotate_refresh_token(self, refresh_token: str) -> RotateResult:
        """Rotate refresh token with grace-period idempotency."""

        old_payload = auth_security.decode_token(refresh_token)
        if old_payload.typ != "refresh" or old_payload.sid is None or old_payload.sub is None:
            raise ValueError("Invalid refresh token")

        old_hash = _sha256(refresh_token)
        grace = self._read_json(self._grace_key(old_hash))
        if grace is not None:
            return RotateResult(
                token=Token(
                    access_token=grace["access_token"],
                    refresh_token=grace["refresh_token"],
                    session_id=grace["sid"],
                    token_type="bearer",
                ),
                reused_from_grace=True,
            )

        refresh_state = self._read_json(self._refresh_key(old_hash))
        if refresh_state is None or refresh_state.get("status") != "active":
            raise ValueError("Refresh token revoked or expired")

        session_state = self._read_json(self._session_key(old_payload.sid))
        if session_state is None or bool(session_state.get("revoked")):
            raise ValueError("Session revoked or expired")

        new_access = auth_security.create_access_token(
            subject=old_payload.sub,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            session_id=old_payload.sid,
        )
        new_refresh = auth_security.create_refresh_token(
            subject=old_payload.sub,
            expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES),
            session_id=old_payload.sid,
        )
        new_hash = _sha256(new_refresh)
        self._write_json_ttl(
            self._refresh_key(new_hash),
            {"uid": old_payload.sub, "sid": old_payload.sid, "status": "active"},
            self._refresh_ttl,
        )
        self._write_json_ttl(
            self._grace_key(old_hash),
            {
                "uid": old_payload.sub,
                "sid": old_payload.sid,
                "access_token": new_access,
                "refresh_token": new_refresh,
            },
            self._grace_seconds,
        )
        self._kv.delete(self._refresh_key(old_hash))
        return RotateResult(
            token=Token(
                access_token=new_access,
                refresh_token=new_refresh,
                session_id=old_payload.sid,
                token_type="bearer",
            ),
            reused_from_grace=False,
        )

    def revoke_session(self, session_id: str, refresh_token: str | None = None) -> None:
        """Revoke session and optionally a specific refresh token."""

        self._write_json_ttl(
            self._session_key(session_id),
            {"revoked": True},
            self._refresh_ttl,
        )
        if refresh_token is not None:
            self._kv.delete(self._refresh_key(_sha256(refresh_token)))


_session_service_singleton: SessionService | None = None


def get_session_service() -> SessionService:
    """Return singleton session service."""

    global _session_service_singleton
    if _session_service_singleton is None:
        _session_service_singleton = SessionService()
    return _session_service_singleton
