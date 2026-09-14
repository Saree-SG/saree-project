"""Online Office editing (ONLYOFFICE Document Server integration).

See docs/plan-chi-tiet-storage-office-be-fe.md GĐ3 and app.services.office_service
for the full design and the reasoning behind each check below.
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.attachment_version import AttachmentVersion, AttachmentVersionPublic
from app.models.user import User
from app.services import office_service
from app.shared import version_store
from app.shared.attachment_access import resolve_attachment
from app.shared.permission import has_permission
from app.shared.signed_url import SignedUrlError, verify

router = APIRouter(tags=["documents"])

_MODULE_EDIT_ONLINE_PERMISSION = "DOCUMENT_EDIT_ONLINE"


@router.get("/documents/{attachment_type}/{attachment_id}/editor-config")
async def get_editor_config(
    attachment_type: str,
    attachment_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> dict:
    """Return the config the frontend feeds straight into ONLYOFFICE's DocEditor."""
    # "view" here — edit rights are decided per-user by office_service, not
    # by gating the whole endpoint, so a viewer still gets a read-only editor.
    resolved = await resolve_attachment(session, current_user, attachment_type, attachment_id, require="view")

    ext = office_service.extension_of(resolved.file_name)
    if ext not in version_store.ALL_SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {ext or '(none)'} is not supported by the online editor",
        )

    has_module_edit = False
    if attachment_type != "chat":
        try:
            editable = await resolve_attachment(
                session, current_user, attachment_type, attachment_id, require="edit"
            )
            has_module_edit = editable is not None
        except HTTPException:
            has_module_edit = False
    else:
        # Chat has no *_UPDATE permission; membership (already checked by
        # resolve_attachment above) is enough to allow editing your own
        # shared file.
        has_module_edit = True

    has_edit_permission = has_module_edit and ext in version_store.EDITABLE_EXTENSIONS
    if has_edit_permission and attachment_type != "chat":
        has_edit_permission = await has_permission(
            session, current_user, _MODULE_EDIT_ONLINE_PERMISSION, target_company_id=resolved.company_id
        )

    permissions = await office_service.resolve_permissions(
        session, resolved, has_edit_permission=has_edit_permission
    )

    try:
        result = await office_service.build_editor_config(session, current_user, resolved, permissions)
    except office_service.OfficeServiceError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return result


@router.post("/documents/{attachment_type}/{attachment_id}/callback")
async def office_callback(
    attachment_type: str,
    attachment_id: uuid.UUID,
    request: Request,
    session: AsyncSessionDep,
    ct: str = Query(..., description="HMAC token minted alongside this callback URL"),
) -> dict:
    """ONLYOFFICE's server-to-server "save" webhook.

    No user JWT reaches this endpoint — ONLYOFFICE cannot send one. Trust is
    established two ways instead: the `ct` query token (bound to this exact
    attachment) and, if configured, ONLYOFFICE's own request-body JWT.

    MUST always return {"error": 0} once the request has been handled (even
    when we chose not to persist anything) — returning a non-zero error or a
    non-200 status makes ONLYOFFICE retry indefinitely and eventually give up
    on the document. See plan Phụ lục D — "callback hỏng âm thầm".
    """
    try:
        ct_payload = verify(ct, purpose="office-callback")
    except SignedUrlError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid callback token") from exc

    if ct_payload["t"] != attachment_type or ct_payload["i"] != str(attachment_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Callback token does not match URL")

    body: dict[str, Any] = await request.json()

    try:
        office_service.verify_onlyoffice_jwt(body.get("token"))
    except office_service.OfficeServiceError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    edited_by = uuid.UUID(ct_payload["u"])
    onlyoffice_status = body.get("status")

    # Statuses per ONLYOFFICE's callback protocol:
    # 1=editing 2=save-ready 3=save-error 4=closed-no-changes 6=forcesave 7=forcesave-error
    if onlyoffice_status in (2, 3, 6, 7):
        file_url = body.get("url")
        if not file_url:
            # Nothing we can recover from disk-side; ack anyway (see docstring).
            return {"error": 0}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(file_url)
                response.raise_for_status()
                content = response.content
        except Exception:  # noqa: BLE001 - never let a fetch failure surface as a 500 to ONLYOFFICE
            return {"error": 0}

        # Everything below must never escape as an HTTP error: this endpoint's
        # contract with ONLYOFFICE is "always 200 {"error":0}", or it will
        # retry forever and eventually drop the user's edit. Any failure here
        # is instead a log-and-alert case (see plan Phụ lục D.6), not a 4xx/5xx.
        try:
            editor = await session.get(User, edited_by)
            if editor is None:
                return {"error": 0}
            resolved = await resolve_attachment(session, editor, attachment_type, attachment_id, require="view")
            ext = office_service.extension_of(resolved.file_name)
            is_autosave = onlyoffice_status in (6, 7)
            await office_service.persist_new_version(
                session,
                attachment_type=attachment_type,
                attachment_id=attachment_id,
                edited_by=edited_by,
                content=content,
                ext=ext,
                is_autosave=is_autosave,
            )
        except HTTPException:
            return {"error": 0}
        except Exception:  # noqa: BLE001 - persistence failure must not break the ack contract
            return {"error": 0}

    return {"error": 0}


@router.get("/documents/{attachment_type}/{attachment_id}/versions")
async def list_versions(
    attachment_type: str,
    attachment_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[AttachmentVersionPublic]:
    await resolve_attachment(session, current_user, attachment_type, attachment_id, require="view")

    result = await session.execute(
        select(AttachmentVersion)
        .where(
            AttachmentVersion.attachment_type == attachment_type,
            AttachmentVersion.attachment_id == attachment_id,
        )
        .order_by(AttachmentVersion.version_no.desc())
    )
    versions = result.scalars().all()

    editor_ids = {v.edited_by for v in versions}
    names: dict[uuid.UUID, str | None] = {}
    if editor_ids:
        users_result = await session.execute(select(User).where(User.id.in_(editor_ids)))
        for u in users_result.scalars().all():
            names[u.id] = u.full_name or u.email

    return [
        AttachmentVersionPublic(
            id=v.id,
            attachment_type=v.attachment_type,
            attachment_id=v.attachment_id,
            version_no=v.version_no,
            size_bytes=v.size_bytes,
            is_autosave=v.is_autosave,
            edited_by=v.edited_by,
            edited_by_name=names.get(v.edited_by),
            edited_at=v.edited_at,
        )
        for v in versions
    ]
