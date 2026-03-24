from fastapi import APIRouter

from app.api.routes import login, private, users, utils, roles
from app.api.routes import projects, tasks, dashboard
from app.core.config import settings

api_router = APIRouter()

# --- Existing routes (keep unchanged) ---
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(utils.router)

# --- New MES routes ---
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(dashboard.router)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
