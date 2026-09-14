"""Resolve the actual bytes/path of "the current version" of an attachment.

Bridges two eras of storage until GĐ1 unifies them:
- Never edited via Office -> the original upload, found via the legacy
  file_url ("/static/<segment>/<name>") or, for chat, the absolute
  storage_path already on the row.
- Edited at least once -> the latest row in attachment_version, read via
  version_store.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment_version import AttachmentVersion
from app.shared import version_store
from app.shared.attachment_access import ResolvedAttachment


class AttachmentContentError(FileNotFoundError):
    """Raised when the underlying file cannot be located on disk."""


async def _latest_version(session: AsyncSession, resolved: ResolvedAttachment) -> AttachmentVersion | None:
    result = await session.execute(
        select(AttachmentVersion)
        .where(
            AttachmentVersion.attachment_type == resolved.attachment_type,
            AttachmentVersion.attachment_id == resolved.attachment_id,
        )
        .order_by(AttachmentVersion.version_no.desc())
        .limit(1)
    )
    return result.scalars().first()


def _legacy_path(resolved: ResolvedAttachment) -> Path:
    if resolved.attachment_type == "chat":
        raw_path = getattr(resolved.row, "storage_path", None)
        if not raw_path:
            raise AttachmentContentError("chat attachment has no storage_path")
        return Path(raw_path)

    file_url = getattr(resolved.row, "file_url", None)
    if not file_url:
        raise AttachmentContentError("attachment has no file_url")
    path = version_store.legacy_path_from_file_url(file_url)
    if path is None:
        raise AttachmentContentError(f"could not resolve legacy path for {file_url!r}")
    return path


async def get_current_path_and_bytes(session: AsyncSession, resolved: ResolvedAttachment) -> tuple[Path, bytes]:
    """Return (path, content) for whatever is currently "the file" for this attachment.

    Raises AttachmentContentError if nothing can be found on disk.
    """
    latest = await _latest_version(session, resolved)
    if latest is not None:
        content = version_store.read_version(latest.storage_key)
        # version_store keys are relative; resolve to the same path it wrote to.
        path = Path(latest.storage_key)
        return path, content

    path = _legacy_path(resolved)
    if not path.is_file():
        raise AttachmentContentError(f"file missing on disk: {path}")
    return path, path.read_bytes()
