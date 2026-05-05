"""Storage abstraction for file attachments."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

_MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MB hard cap

from app.core.config import settings


@dataclass(frozen=True, slots=True)
class StoredObject:
    """Result of storing a file object."""

    storage_path: str
    public_url: str
    stored_name: str
    size_bytes: int


class LocalStorage:
    """Local filesystem storage (dev-friendly, single-node)."""

    def __init__(
        self,
        base_dir: str | Path | None = None,
        *,
        static_url_segment: str = "chat",
    ) -> None:
        """Create local storage rooted at base_dir (defaults to chat upload dir)."""

        self._base_dir = Path(base_dir) if base_dir is not None else Path(settings.CHAT_UPLOAD_DIR)
        self._base_dir.mkdir(parents=True, exist_ok=True)
        self._static_segment = static_url_segment.strip("/")

    def _safe_name(self, original_filename: str) -> str:
        """Generate a safe stored filename."""

        return f"{uuid.uuid4()}_{os.path.basename(original_filename)}"

    def _public_url(self, stored_name: str) -> str:
        """Build browser-usable URL path (absolute path on API host when PUBLIC_BASE_URL unset)."""

        if settings.PUBLIC_BASE_URL:
            return f"{str(settings.PUBLIC_BASE_URL).rstrip('/')}/static/{self._static_segment}/{stored_name}"
        return f"/static/{self._static_segment}/{stored_name}"

    async def save_upload(
        self,
        upload: UploadFile,
        *,
        max_bytes: int = _MAX_UPLOAD_BYTES,
    ) -> StoredObject:
        """Persist an UploadFile to disk in 64 KB chunks and return metadata.

        Raises ValueError if the file is empty, has no filename, or exceeds max_bytes.
        Cleans up any partial file on error.
        """
        if not upload.filename:
            raise ValueError("filename is required")
        stored_name = self._safe_name(upload.filename)
        out_path = self._base_dir / stored_name
        total_bytes = 0
        try:
            with out_path.open("wb") as fh:
                while True:
                    chunk = await upload.read(65536)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        raise ValueError(
                            f"File exceeds maximum allowed size of {max_bytes} bytes"
                        )
                    fh.write(chunk)
        except Exception:
            out_path.unlink(missing_ok=True)
            raise
        if total_bytes == 0:
            out_path.unlink(missing_ok=True)
            raise ValueError("empty file")
        return StoredObject(
            storage_path=str(out_path),
            public_url=self._public_url(stored_name),
            stored_name=stored_name,
            size_bytes=total_bytes,
        )

