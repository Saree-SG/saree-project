"""Storage abstraction for file attachments."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings


@dataclass(frozen=True, slots=True)
class StoredObject:
    """Result of storing a file object."""

    storage_path: str
    public_url: str | None
    stored_name: str
    size_bytes: int


class LocalStorage:
    """Local filesystem storage (dev-friendly, single-node)."""

    def __init__(self, base_dir: str | Path | None = None) -> None:
        """Create local storage rooted at base_dir (defaults to settings)."""

        self._base_dir = Path(base_dir) if base_dir is not None else Path(settings.CHAT_UPLOAD_DIR)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _safe_name(self, original_filename: str) -> str:
        """Generate a safe stored filename."""

        return f"{uuid.uuid4()}_{os.path.basename(original_filename)}"

    def _public_url(self, stored_name: str) -> str | None:
        """Build public URL when PUBLIC_BASE_URL is configured."""

        if not settings.PUBLIC_BASE_URL:
            return None
        return f"{str(settings.PUBLIC_BASE_URL).rstrip('/')}/static/chat/{stored_name}"

    async def save_upload(self, upload: UploadFile) -> StoredObject:
        """Persist an UploadFile to disk and return metadata."""

        if not upload.filename:
            raise ValueError("filename is required")
        stored_name = self._safe_name(upload.filename)
        out_path = self._base_dir / stored_name
        data = await upload.read()
        if not data:
            raise ValueError("empty file")
        out_path.write_bytes(data)
        return StoredObject(
            storage_path=str(out_path),
            public_url=self._public_url(stored_name),
            stored_name=stored_name,
            size_bytes=len(data),
        )

