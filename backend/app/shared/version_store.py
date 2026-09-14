"""Disk storage for attachment_version files (GĐ3 minimal slice).

Deliberately separate from the module upload dirs (CHAT_UPLOAD_DIR etc.) and
from the future unified StorageService (GĐ1) — this only needs to satisfy
online Office editing today. When GĐ1 lands, only the two functions below
that touch the filesystem need to change; callers (office_service) do not.

Layout on disk: OFFICE_VERSION_DIR / {attachment_type} / {attachment_id} / v{n}{ext}
"""

from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

from app.core.config import settings

# docx/xlsx/pptx are all zip containers -> magic bytes "PK\x03\x04" (or empty-zip "PK\x05\x06").
_ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06")

EDITABLE_EXTENSIONS = {".docx", ".xlsx", ".pptx"}
VIEWABLE_ONLY_EXTENSIONS = {".doc", ".xls", ".ppt", ".pdf", ".odt", ".ods", ".csv", ".txt"}
ALL_SUPPORTED_EXTENSIONS = EDITABLE_EXTENSIONS | VIEWABLE_ONLY_EXTENSIONS


class VersionStoreError(ValueError):
    """Raised on an invalid extension, oversized, or non-Office-looking payload."""


def _root() -> Path:
    root = Path(settings.OFFICE_VERSION_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def relative_key(attachment_type: str, attachment_id: uuid.UUID, version_no: int, ext: str) -> str:
    """Build the storage_key stored on attachment_version.storage_key."""
    ext = ext if ext.startswith(".") else f".{ext}"
    return f"{attachment_type}/{attachment_id}/v{version_no}{ext}"


def _absolute_path(rel_key: str) -> Path:
    """Resolve a stored relative key to an absolute path, refusing escape.

    Any relative key must resolve to somewhere inside OFFICE_VERSION_DIR.
    This is the same defense-in-depth check GĐ1's StorageService will apply
    system-wide; applied here now because this module already writes
    server-controlled paths from user-influenced input (attachment_id).
    """
    root = _root()
    candidate = (root / rel_key).resolve()
    if not candidate.is_relative_to(root):
        raise VersionStoreError("resolved path escapes OFFICE_VERSION_DIR")
    return candidate


def validate_extension(ext: str, *, must_be_editable: bool = False) -> str:
    """Normalize and validate an extension, or raise VersionStoreError."""
    ext = ext.lower()
    ext = ext if ext.startswith(".") else f".{ext}"
    allowed = EDITABLE_EXTENSIONS if must_be_editable else ALL_SUPPORTED_EXTENSIONS
    if ext not in allowed:
        raise VersionStoreError(f"extension {ext!r} is not allowed")
    return ext


def validate_office_payload(content: bytes, ext: str) -> None:
    """Reject payloads that are too large or don't look like the claimed format.

    docx/xlsx/pptx are zip archives — anything claiming that extension but not
    starting with the zip magic bytes is not a real Office document (or is
    corrupted) and must not be persisted as a "saved" version.
    """
    max_bytes = settings.MAX_OFFICE_SAVE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise VersionStoreError(f"file exceeds {settings.MAX_OFFICE_SAVE_MB} MB limit")
    if len(content) == 0:
        raise VersionStoreError("empty file")
    if ext in EDITABLE_EXTENSIONS and not content.startswith(_ZIP_MAGIC):
        raise VersionStoreError("payload does not look like a valid Office document")


def write_version(rel_key: str, content: bytes) -> tuple[int, str]:
    """Atomically write a version's bytes to disk. Returns (size_bytes, sha256_hex)."""
    path = _absolute_path(rel_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    checksum = hashlib.sha256(content).hexdigest()
    tmp_path = path.with_suffix(path.suffix + f".tmp-{uuid.uuid4().hex}")
    try:
        with tmp_path.open("wb") as fh:
            fh.write(content)
        os.replace(tmp_path, path)
    finally:
        tmp_path.unlink(missing_ok=True)
    return len(content), checksum


def read_version(rel_key: str) -> bytes:
    path = _absolute_path(rel_key)
    if not path.is_file():
        raise FileNotFoundError(rel_key)
    return path.read_bytes()


# --- Legacy bridge -----------------------------------------------------
# Until GĐ1's backfill runs, existing attachments have no storage_key: they
# only have the old public file_url (e.g. "/static/quotation/<uuid>_name.docx").
# This maps that URL back to the real file on disk so "open for the first
# time" works today without waiting on GĐ1.

_LEGACY_SEGMENT_TO_SETTING = {
    "chat": "CHAT_UPLOAD_DIR",
    "task-progress": "TASK_PROGRESS_UPLOAD_DIR",
    "task_progress": "TASK_PROGRESS_UPLOAD_DIR",
    "quotation": "QUOTATION_UPLOAD_DIR",
    "contract": "CONTRACT_UPLOAD_DIR",
    "attendance": "ATTENDANCE_UPLOAD_DIR",
    "incident": "INCIDENT_UPLOAD_DIR",
}


def legacy_path_from_file_url(file_url: str) -> Path | None:
    """Resolve an old-style "/static/<segment>/<stored_name>" URL to disk.

    Returns None if the URL doesn't match the expected shape or the resolved
    path would escape the configured upload dir (defense against a malformed
    or tampered file_url ever reaching this far).
    """
    try:
        # file_url may be absolute ("https://host/static/x/y") or root-relative.
        path_part = file_url.split("/static/", 1)[1]
        segment, stored_name = path_part.split("/", 1)
    except (IndexError, ValueError):
        return None

    setting_name = _LEGACY_SEGMENT_TO_SETTING.get(segment)
    if setting_name is None:
        return None

    base_dir = Path(getattr(settings, setting_name)).resolve()
    candidate = (base_dir / stored_name).resolve()
    if not candidate.is_relative_to(base_dir):
        return None
    return candidate
