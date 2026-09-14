"""ONLYOFFICE Document Server integration.

Flow (see docs/plan-chi-tiet-storage-office-be-fe.md GĐ3 for the full design):

1. Frontend calls GET /documents/{type}/{id}/editor-config.
   -> resolve_attachment() (tenant + permission check)
   -> build_editor_config() returns {document_server_url, config} where
      config.document.url is a *signed* URL pointing back at our own
      /files/signed/{token} route (never a bare /static/ link — see
      Phụ lục C.4 of the plan).
2. Browser loads ONLYOFFICE's api.js from document_server_url and opens the
   editor with that config.
3. ONLYOFFICE's document server fetches config.document.url itself (server
   to server, inside the docker network) to render the file.
4. When the user saves, ONLYOFFICE POSTs the new file to callbackUrl.
   -> handle_callback() persists a new attachment_version row + file.

document.key MUST change every time the underlying content changes, or
ONLYOFFICE serves a stale cached render — see plan Phụ lục, "document.key
phải đổi mỗi version". We derive it from (attachment_id, version_no).
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath

import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.attachment_version import AttachmentVersion
from app.models.contract import Contract
from app.models.quotation import Quotation
from app.models.user import User
from app.shared import version_store
from app.shared.attachment_access import ResolvedAttachment
from app.shared.signed_url import sign

# Statuses that make a document read-only regardless of the user's own
# permissions — an approved contract or a signed quotation must not be
# editable via the online editor (see plan Phụ lục D.9).
_LOCKED_QUOTATION_STATUSES = {"won", "lost", "cancelled"}
_LOCKED_CONTRACT_STATUSES = {"completed", "cancelled", "liquidated"}


class OfficeServiceError(ValueError):
    """Raised for a request the caller made in bad faith or bad state."""


@dataclass(frozen=True, slots=True)
class DocumentPermissions:
    can_edit: bool
    can_download: bool = True
    can_print: bool = True
    can_review: bool = False


async def _latest_version(session: AsyncSession, attachment_type: str, attachment_id: uuid.UUID) -> AttachmentVersion | None:
    result = await session.execute(
        select(AttachmentVersion)
        .where(
            AttachmentVersion.attachment_type == attachment_type,
            AttachmentVersion.attachment_id == attachment_id,
        )
        .order_by(AttachmentVersion.version_no.desc())
        .limit(1)
    )
    return result.scalars().first()


async def _next_version_no(session: AsyncSession, attachment_type: str, attachment_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.max(AttachmentVersion.version_no)).where(
            AttachmentVersion.attachment_type == attachment_type,
            AttachmentVersion.attachment_id == attachment_id,
        )
    )
    current_max = result.scalar()
    return (current_max or 0) + 1


def extension_of(file_name: str) -> str:
    return PurePosixPath(file_name).suffix.lower()


async def _is_locked(session: AsyncSession, resolved: ResolvedAttachment) -> bool:
    """Return True when the parent entity's status forbids editing."""
    if resolved.attachment_type == "quotation":
        quotation_id = resolved.row.quotation_id  # type: ignore[attr-defined]
        quotation = await session.get(Quotation, quotation_id)
        return quotation is not None and quotation.status in _LOCKED_QUOTATION_STATUSES
    if resolved.attachment_type == "contract":
        contract_id = resolved.row.contract_id  # type: ignore[attr-defined]
        contract = await session.get(Contract, contract_id)
        return contract is not None and contract.status in _LOCKED_CONTRACT_STATUSES
    return False


async def resolve_permissions(
    session: AsyncSession,
    resolved: ResolvedAttachment,
    *,
    has_edit_permission: bool,
) -> DocumentPermissions:
    """Decide ONLYOFFICE edit/review/download flags for this document.

    has_edit_permission must already reflect both the module *_UPDATE
    permission AND the DOCUMENT_EDIT_ONLINE permission — callers (the route)
    compute that via resolve_attachment(require="edit") + a permission check,
    this function only adds the entity-status lock on top.
    """
    if not has_edit_permission:
        return DocumentPermissions(can_edit=False)
    if await _is_locked(session, resolved):
        return DocumentPermissions(can_edit=False)
    return DocumentPermissions(can_edit=True)


async def build_editor_config(
    session: AsyncSession,
    user: User,
    resolved: ResolvedAttachment,
    permissions: DocumentPermissions,
) -> dict:
    """Build the ONLYOFFICE editor config + a signed JWT of it.

    Returns {"document_server_url": ..., "config": {...}} — the frontend
    passes `config` (unmodified) straight into `new DocsAPI.DocEditor(...)`.
    config.token is the signed JWT ONLYOFFICE requires when JWT_ENABLED=true.
    """
    if not settings.ONLYOFFICE_PUBLIC_URL:
        raise OfficeServiceError("ONLYOFFICE_PUBLIC_URL is not configured")

    ext = extension_of(resolved.file_name).lstrip(".")
    if not ext:
        raise OfficeServiceError("attachment has no file extension")

    latest = await _latest_version(session, resolved.attachment_type, resolved.attachment_id)
    version_no = latest.version_no if latest else 0
    document_key = f"{resolved.attachment_type}-{resolved.attachment_id}-v{version_no}"[:128]

    download_token = sign(
        attachment_type=resolved.attachment_type,
        attachment_id=resolved.attachment_id,
        user_id=user.id,
        purpose="office-edit",
        ttl_seconds=settings.OFFICE_EDIT_SIGNED_URL_TTL_SECONDS,
    )
    document_url = f"{settings.ONLYOFFICE_INTERNAL_URL}/api/v1/files/signed/{download_token}"

    callback_token = sign(
        attachment_type=resolved.attachment_type,
        attachment_id=resolved.attachment_id,
        user_id=user.id,
        purpose="office-callback",
        ttl_seconds=settings.OFFICE_EDIT_SIGNED_URL_TTL_SECONDS,
    )
    callback_url = (
        f"{settings.ONLYOFFICE_INTERNAL_URL}/api/v1/documents/"
        f"{resolved.attachment_type}/{resolved.attachment_id}/callback?ct={callback_token}"
    )

    config: dict = {
        "document": {
            "fileType": ext,
            "key": document_key,
            "title": resolved.file_name,
            "url": document_url,
            "permissions": {
                "edit": permissions.can_edit,
                "download": permissions.can_download,
                "print": permissions.can_print,
                "review": permissions.can_review,
            },
        },
        "documentType": _document_type_for_ext(ext),
        "editorConfig": {
            "mode": "edit" if permissions.can_edit else "view",
            "lang": "vi",
            "callbackUrl": callback_url,
            "user": {"id": str(user.id), "name": user.full_name or user.email},
            "customization": {"forcesave": True},
        },
    }

    if settings.ONLYOFFICE_JWT_SECRET:
        config["token"] = jwt.encode(config, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")

    return {"document_server_url": settings.ONLYOFFICE_PUBLIC_URL, "config": config}


def _document_type_for_ext(ext: str) -> str:
    if ext in {"docx", "doc", "odt", "txt"}:
        return "word"
    if ext in {"xlsx", "xls", "ods", "csv"}:
        return "cell"
    if ext in {"pptx", "ppt", "odp"}:
        return "slide"
    return "word"


def verify_onlyoffice_jwt(token: str | None) -> None:
    """Verify the JWT ONLYOFFICE attaches to callback requests.

    Raises OfficeServiceError if JWT is required (secret configured) but
    missing or invalid. Without this check, anyone who learns the callback
    URL shape could push arbitrary "saved" content into an attachment.
    """
    if not settings.ONLYOFFICE_JWT_SECRET:
        return
    if not token:
        raise OfficeServiceError("missing ONLYOFFICE JWT")
    try:
        jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise OfficeServiceError(f"invalid ONLYOFFICE JWT: {exc}") from exc


async def persist_new_version(
    session: AsyncSession,
    *,
    attachment_type: str,
    attachment_id: uuid.UUID,
    edited_by: uuid.UUID,
    content: bytes,
    ext: str,
    is_autosave: bool = False,
) -> AttachmentVersion:
    """Validate + write a new version's bytes and record it.

    Deduplicates by checksum against the current latest version: an
    ONLYOFFICE autosave with unchanged content does not create a new row
    (see plan Phụ lục D.4 — disk growth control).
    """
    ext = version_store.validate_extension(ext)
    version_store.validate_office_payload(content, ext)

    checksum = hashlib.sha256(content).hexdigest()
    latest = await _latest_version(session, attachment_type, attachment_id)
    if latest is not None and latest.checksum == checksum:
        return latest

    version_no = await _next_version_no(session, attachment_type, attachment_id)
    rel_key = version_store.relative_key(attachment_type, attachment_id, version_no, ext)
    size_bytes, written_checksum = version_store.write_version(rel_key, content)

    version = AttachmentVersion(
        attachment_type=attachment_type,
        attachment_id=attachment_id,
        version_no=version_no,
        storage_key=rel_key,
        size_bytes=size_bytes,
        checksum=written_checksum,
        is_autosave=is_autosave,
        edited_by=edited_by,
    )
    session.add(version)
    await session.flush()
    return version
