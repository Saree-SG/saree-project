from datetime import timedelta
from typing import Any

from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.auth.security import create_access_token as auth_create_access_token

password_hash = PasswordHash(
    (
        Argon2Hasher(),
        BcryptHasher(),
    )
)

def create_access_token(subject: str | Any, expires_delta: timedelta) -> str:
    """Create backward-compatible access token."""

    return auth_create_access_token(subject=subject, expires_delta=expires_delta)


def verify_password(
    plain_password: str, hashed_password: str
) -> tuple[bool, str | None]:
    return password_hash.verify_and_update(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)
