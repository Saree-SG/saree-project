from fastapi import APIRouter

from app.api.routes import (
    admin_stats,
    admin_users,
    attendance,
    chat,
    chat_ws,
    contracts,
    dashboard,
    export,
    incidents,
    login,
    notifications,
    private,
    projects,
    quotations,
    roles,
    task_profiles,
    task_ws,
    tasks,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()

api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(utils.router)
api_router.include_router(chat.router)
api_router.include_router(chat_ws.router)
api_router.include_router(task_ws.router)

api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(task_profiles.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(quotations.router)
api_router.include_router(contracts.router)
api_router.include_router(export.router)
api_router.include_router(admin_stats.router)
api_router.include_router(admin_users.router)
api_router.include_router(attendance.router)
api_router.include_router(incidents.router)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
