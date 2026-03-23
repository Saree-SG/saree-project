"""Generic response schemas (moved from flat models.py)."""

from sqlmodel import SQLModel


class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    session_id: str | None = None


class TokenPayload(SQLModel):
    sub: str | None = None
    sid: str | None = None
    jti: str | None = None
    typ: str | None = None


class RefreshTokenRequest(SQLModel):
    refresh_token: str


class LogoutRequest(SQLModel):
    refresh_token: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str
