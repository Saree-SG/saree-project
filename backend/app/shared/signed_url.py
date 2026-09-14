"""Short-lived HMAC-signed tokens for file access without a JWT.

Used where the requester cannot send an Authorization header (an <img> tag,
or the ONLYOFFICE document server fetching/pushing a file). The token binds
a specific attachment + user + purpose to a short expiry — it is NOT a
general-purpose auth mechanism and must never outlive its stated TTL.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

from app.core.config import settings

_DEFAULT_TTL_SECONDS = 300


class SignedUrlError(ValueError):
    """Raised when a signed token is missing, malformed, tampered, or expired."""


def _key() -> bytes:
    return settings.SECRET_KEY.encode("utf-8")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign(
    *,
    attachment_type: str,
    attachment_id: uuid.UUID,
    user_id: uuid.UUID,
    purpose: str = "download",
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
) -> str:
    """Create a signed token good for `ttl_seconds` from now.

    purpose distinguishes tokens minted for different uses (e.g. "download"
    vs "office-edit") so one cannot be replayed as the other.
    """
    payload = {
        "t": attachment_type,
        "i": str(attachment_id),
        "u": str(user_id),
        "p": purpose,
        "exp": int(time.time()) + ttl_seconds,
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body_b64 = _b64encode(body)
    signature = hmac.new(_key(), body_b64.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = _b64encode(signature)
    return f"{body_b64}.{sig_b64}"


def verify(token: str, *, purpose: str | None = None) -> dict:
    """Verify a token and return its payload dict, or raise SignedUrlError.

    Raises on: malformed token, bad signature, expired token, or purpose
    mismatch when `purpose` is given.
    """
    try:
        body_b64, sig_b64 = token.split(".", 1)
    except ValueError as exc:
        raise SignedUrlError("malformed token") from exc

    expected_sig = hmac.new(_key(), body_b64.encode("ascii"), hashlib.sha256).digest()
    try:
        given_sig = _b64decode(sig_b64)
    except Exception as exc:  # noqa: BLE001 - any decode failure means invalid token
        raise SignedUrlError("malformed signature") from exc

    if not hmac.compare_digest(expected_sig, given_sig):
        raise SignedUrlError("signature mismatch")

    try:
        payload = json.loads(_b64decode(body_b64))
    except Exception as exc:  # noqa: BLE001
        raise SignedUrlError("malformed payload") from exc

    if int(payload.get("exp", 0)) < int(time.time()):
        raise SignedUrlError("token expired")

    if purpose is not None and payload.get("p") != purpose:
        raise SignedUrlError("purpose mismatch")

    return payload
