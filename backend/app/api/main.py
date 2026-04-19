from fastapi import APIRouter

from app.api.routes import (
    chat,
    chat_ws,
    dashboard,
    login,
    notifications,
    private,
    projects,
    roles,
    task_ws,
    tasks,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()

# --- Existing routes (keep unchanged) ---
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(utils.router)
api_router.include_router(chat.router)
api_router.include_router(chat_ws.router)
api_router.include_router(task_ws.router)

# --- New MES routes ---
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
