"""Authenticated file download — replaces the public /static/* mounts for
attachment types covered so far (quotation, contract, incident, chat).

Every route here goes through app.shared.attachment_access.resolve_attachment
so tenant isolation and per-module permission checks live in exactly one
place. See docs/plan-chi-tiet-storage-office-be-fe.md GĐ1.
"""

from __future__ import annotations

import mimetypes
import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import AsyncSessionDep, CurrentUser
from app.core.config import settings
from app.shared.attachment_access import resolve_attachment
from app.shared.attachment_content import (
    AttachmentContentError,
    get_current_path_and_bytes,
)
from app.shared.signed_url import SignedUrlError, sign, verify

router = APIRouter(tags=["files"])


def _content_disposition(file_name: str) -> str:
    # RFC 5987 encoding so Vietnamese filenames survive the header.
    return f"attachment; filename*=UTF-8''{quote(file_name)}"


def _security_headers() -> dict[str, str]:
    return {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }


@router.get("/files/{attachment_type}/{attachment_id}")
async def download_attachment(
    attachment_type: str,
    attachment_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    """Download an attachment. Requires a valid session JWT."""
    resolved = await resolve_attachment(session, current_user, attachment_type, attachment_id, require="view")
    try:
        path, content = await get_current_path_and_bytes(session, resolved)
    except AttachmentContentError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk") from exc

    media_type = mimetypes.guess_type(resolved.file_name)[0] or "application/octet-stream"
    headers = _security_headers()
    headers["Content-Disposition"] = _content_disposition(resolved.file_name)
    return Response(content=content, media_type=media_type, headers=headers)


@router.get("/files/{attachment_type}/{attachment_id}/signed-url")
async def get_signed_url(
    attachment_type: str,
    attachment_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    """Mint a short-lived URL usable without an Authorization header

    (e.g. for an <img src=...> tag). TTL is deliberately short — see
    settings.FILE_SIGNED_URL_TTL_SECONDS.
    """
    await resolve_attachment(session, current_user, attachment_type, attachment_id, require="view")
    token = sign(
        attachment_type=attachment_type,
        attachment_id=attachment_id,
        user_id=current_user.id,
        purpose="download",
        ttl_seconds=settings.FILE_SIGNED_URL_TTL_SECONDS,
    )
    return {"url": f"/api/v1/files/signed/{token}", "expires_in": settings.FILE_SIGNED_URL_TTL_SECONDS}


@router.get("/files/signed/{token}")
async def download_by_signed_token(token: str, session: AsyncSessionDep):
    """Download using a signed token instead of a JWT — for <img> tags and
    for the ONLYOFFICE document server (which cannot send our session JWT).

    The token itself already encodes attachment_type/id/user_id and an
    expiry; re-checking permission here (not just trusting the token) means
    a permission revoked after the token was minted is still enforced.
    """
    try:
        payload = verify(token)
    except SignedUrlError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link") from exc

    from app.models.user import User  # local import to avoid a route-module cycle

    user = await session.get(User, uuid.UUID(payload["u"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")

    attachment_type = payload["t"]
    attachment_id = uuid.UUID(payload["i"])
    resolved = await resolve_attachment(session, user, attachment_type, attachment_id, require="view")
    try:
        path, content = await get_current_path_and_bytes(session, resolved)
    except AttachmentContentError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk") from exc

    media_type = mimetypes.guess_type(resolved.file_name)[0] or "application/octet-stream"
    headers = _security_headers()
    headers["Content-Disposition"] = _content_disposition(resolved.file_name)
    return Response(content=content, media_type=media_type, headers=headers)
