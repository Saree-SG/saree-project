"""Authentication routes (login, token refresh, logout, password reset)."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import (
    AsyncSessionDep,
    CurrentUser,
    get_current_active_superuser,
)
from app.core.auth.security import decode_token
from app.core.auth.session_service import get_session_service
from app.models import (
    LogoutRequest,
    Message,
    NewPassword,
    RefreshTokenRequest,
    Token,
    UserPublic,
    UserUpdate,
)
from app.services.user_service import UserService
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])
logger = logging.getLogger(__name__)


@router.post("/login/access-token")
async def login_access_token(
    session: AsyncSessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """OAuth2 token login — returns access + refresh token pair."""
    user = await UserService(session).authenticate(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    logger.info(
        "login issued username=%s user_id=%s",
        form_data.username,
        user.id,
    )
    return get_session_service().issue_login_tokens(str(user.id))


@router.post("/login/test-token", response_model=UserPublic)
async def test_token(current_user: CurrentUser) -> Any:
    """Test access token validity."""
    return current_user


@router.post("/login/refresh-token", response_model=Token)
def refresh_access_token(body: RefreshTokenRequest) -> Token:
    """Rotate refresh token and return new token pair."""
    try:
        result = get_session_service().rotate_refresh_token(body.refresh_token)
        return result.token
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.post("/login/logout", response_model=Message)
def logout(
    body: LogoutRequest,
) -> Message:
    """Revoke current session and optional refresh token."""
    if not body.refresh_token:
        return Message(message="Logged out successfully")

    try:
        payload = decode_token(body.refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    if payload.typ and payload.typ != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    if payload.sid:
        get_session_service().revoke_session(payload.sid, body.refresh_token)
    return Message(message="Logged out successfully")


@router.post("/password-recovery/{email}")
async def recover_password(email: str, session: AsyncSessionDep) -> Message:
    """Send password recovery email if user exists."""
    user = await UserService(session).get_by_email(email)
    if user:
        token = generate_password_reset_token(email=email)
        email_data = generate_reset_password_email(
            email_to=user.email, email=email, token=token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(
        message="If that email is registered, we sent a password recovery link"
    )


@router.post("/reset-password/")
async def reset_password(session: AsyncSessionDep, body: NewPassword) -> Message:
    """Reset password using recovery token."""
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    svc = UserService(session)
    user = await svc.get_by_email(email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    await svc.update_user_admin(user.id, UserUpdate(password=body.new_password))
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
async def recover_password_html_content(email: str, session: AsyncSessionDep) -> Any:
    """Return HTML email content for password recovery preview."""
    user = await UserService(session).get_by_email(email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=token
    )
    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
