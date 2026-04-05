"""Loguru-based logging for FastAPI (request + exception logs)."""

from __future__ import annotations

import logging
import sys
import time
from typing import Any, Callable

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


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


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log requests with timing and error details."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Any]) -> Response:
        start = time.perf_counter()

        raw_body = b""
        try:
            raw_body = await request.body()
            request._body = raw_body  # type: ignore[attr-defined]
        except Exception:
            pass

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "Unhandled exception {method} {path} ({duration_ms}ms)",
                method=request.method,
                path=str(request.url.path),
                duration_ms=duration_ms,
            )
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        status = response.status_code
        if status >= 400:
            body_txt = _safe_body_for_log(request, raw_body)
            logger.warning(
                "HTTP {status} {method} {path} ({duration_ms}ms) query={query} body={body}",
                status=status,
                method=request.method,
                path=str(request.url.path),
                duration_ms=duration_ms,
                query=dict(request.query_params),
                body=body_txt,
            )
        else:
            logger.info(
                "HTTP {status} {method} {path} ({duration_ms}ms)",
                status=status,
                method=request.method,
                path=str(request.url.path),
                duration_ms=duration_ms,
            )
        return response


def log_validation_error(request: Request, exc: RequestValidationError) -> None:
    """Log request validation errors (422) with details."""

    logger.warning(
        "ValidationError {method} {path} errors={errors} query={query}",
        method=request.method,
        path=str(request.url.path),
        errors=exc.errors(),
        query=dict(request.query_params),
    )

