from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from loguru import logger
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocket

from app.api.main import api_router
from app.core.config import settings
from app.core.logging import (
    RequestLoggingMiddleware,
    log_validation_error,
    setup_loguru,
)


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

setup_loguru()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    yield
    # Graceful shutdown: release DB connection pools and Redis connections.
    from app.core.database.engine import async_engine, sync_engine
    from app.shared.chat_realtime import chat_fanout

    await async_engine.dispose()
    sync_engine.dispose()

    if chat_fanout.enabled() and chat_fanout._client is not None:
        try:
            await chat_fanout._client.aclose()
        except Exception:
            pass

    logger.info("Application shutdown complete — all resources released.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# Request/exception logs
app.add_middleware(RequestLoggingMiddleware)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    log_validation_error(request, exc)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request | WebSocket, exc: HTTPException):
    logger.warning(
        "HTTPException {status} {method} {path} detail={detail}",
        status=exc.status_code,
        method=getattr(request, "method", "WEBSOCKET"),
        path=str(getattr(request, "url", "websocket")).split("?", 1)[0],
        detail=exc.detail,
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# CORS
# In local dev, allow any origin (LAN testing) in addition to configured origins.
if settings.ENVIRONMENT == "local":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
elif settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)

# Static serving for chat uploads (local storage mode)
chat_upload_dir = Path(settings.CHAT_UPLOAD_DIR).resolve()
chat_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/chat", StaticFiles(directory=str(chat_upload_dir)), name="chat-static")

task_progress_upload_dir = Path(settings.TASK_PROGRESS_UPLOAD_DIR).resolve()
task_progress_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/static/task-progress",
    StaticFiles(directory=str(task_progress_upload_dir)),
    name="task-progress-static",
)
app.mount(
    "/static/task_progress",
    StaticFiles(directory=str(task_progress_upload_dir)),
    name="task-progress-static-underscore",
)

quotation_upload_dir = Path(settings.QUOTATION_UPLOAD_DIR).resolve()
quotation_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/static/quotation",
    StaticFiles(directory=str(quotation_upload_dir)),
    name="quotation-static",
)
