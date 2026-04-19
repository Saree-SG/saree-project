"""Loguru-based logging for FastAPI (request + exception logs)."""

from __future__ import annotations

import logging
import sys
import time
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from loguru import logger
from starlette.types import ASGIApp, Receive, Scope, Send


class InterceptHandler(logging.Handler):
    """Redirect standard logging records to Loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        """Emit a log record via Loguru."""

        try:
            level = logger.level(record.levelname).name
        except Exception:
            level = record.levelno

        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def setup_loguru() -> None:
    """Configure Loguru as the app-wide logger."""

    logger.remove()
    logger.add(
        sys.stdout,
        level="INFO",
        backtrace=False,
        diagnose=False,
        enqueue=True,
        colorize=True,
    )

    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(logging.INFO)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logging.getLogger(name).handlers = [InterceptHandler()]
        logging.getLogger(name).propagate = False


def _safe_body_for_log(request: Request, raw: bytes, limit: int = 8_192) -> str | None:
    """Return a safe string body for logging (small JSON/text only)."""

    ctype = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in ctype:
        return None
    if "application/octet-stream" in ctype:
        return None
    if not raw:
        return None
    if len(raw) > limit:
        return f"<body {len(raw)} bytes (truncated)>"
    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return "<body decode failed>"


class RequestLoggingMiddleware:
    """Log requests with timing and error details.

    Implemented as plain ASGI middleware (not BaseHTTPMiddleware) to preserve
    exception handling and CORS behavior.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()

        status_code: int | None = None

        async def send_wrapper(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "Unhandled exception {method} {path} ({duration_ms}ms)",
                method=scope.get("method"),
                path=scope.get("path"),
                duration_ms=duration_ms,
            )
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        method = scope.get("method")
        path = scope.get("path")
        status = status_code or 0
        if status >= 400:
            logger.warning(
                "HTTP {status} {method} {path} ({duration_ms}ms)",
                status=status,
                method=method,
                path=path,
                duration_ms=duration_ms,
            )
        else:
            logger.info(
                "HTTP {status} {method} {path} ({duration_ms}ms)",
                status=status,
                method=method,
                path=path,
                duration_ms=duration_ms,
            )


def log_validation_error(request: Request, exc: RequestValidationError) -> None:
    """Log request validation errors (422) with details."""

    logger.warning(
        "ValidationError {method} {path} errors={errors} query={query}",
        method=request.method,
        path=str(request.url.path),
        errors=exc.errors(),
        query=dict(request.query_params),
    )

