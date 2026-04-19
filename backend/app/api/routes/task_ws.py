"""Task-scoped WebSocket — subscribe to realtime task updates (delay, proof, status)."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_ws_session_factory
from app.api.routes.chat_ws import get_current_user_from_ws
from app.models.org import ProjectMemberRole, Role, UserCompanyRole
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.repositories.task_repository import TaskRepository
from app.shared.permission import has_permission
from app.shared.task_realtime import (
    run_task_ws_receive_loop,
    task_user_ws_manager,
    task_ws_manager,
)

router = APIRouter(tags=["task-ws"])
logger = logging.getLogger(__name__)


async def _can_access_task_ws(session: AsyncSession, user: User, task: Task) -> bool:
    """Return True when ``user`` may subscribe to realtime updates for ``task``."""
    if user.is_superuser:
        return True
    if task.assignee_id == user.id or task.assignor_id == user.id:
        return True
    if await has_permission(session, user, "TASK_VIEW_ALL", task.project_id):
        return True
    if await has_permission(session, user, "TASK_VIEW", task.project_id):
        return True
    if await has_permission(session, user, "TASK_UPDATE", task.project_id):
        return True
    project = await session.get(Project, task.project_id)
    if project is None:
        return False
    company_levels = await session.execute(
        select(Role.level)
        .join(UserCompanyRole, UserCompanyRole.role_id == Role.id)
        .where(
            UserCompanyRole.user_id == user.id,
            UserCompanyRole.company_id == project.company_id,
        )
    )
    if any(row[0] <= 2 for row in company_levels.all()):
        return True
    project_levels = await session.execute(
        select(Role.level)
        .join(ProjectMemberRole, ProjectMemberRole.role_id == Role.id)
        .where(
            ProjectMemberRole.project_id == task.project_id,
            ProjectMemberRole.user_id == user.id,
        )
    )
    return any(row[0] <= 2 for row in project_levels.all())


@router.websocket("/tasks/ws")
async def task_ws_endpoint(
    websocket: WebSocket,
    task_id: uuid.UUID = Query(..., description="Task id to subscribe to"),
    session_factory=Depends(get_ws_session_factory),
) -> None:
    """Authenticate, authorize, then keep the socket open for task event fan-out."""
    async with session_factory() as auth_session:
        async with auth_session.begin():
            try:
                current_user = await get_current_user_from_ws(websocket, auth_session)
                task_repo = TaskRepository(auth_session)
                task = await task_repo.get_or_404(task_id)
                allowed = await _can_access_task_ws(auth_session, current_user, task)
                if not allowed:
                    await websocket.close(code=4403, reason="Forbidden")
                    return
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, str) else "Unauthorized"
                await websocket.close(code=4403, reason=detail[:120])
                return

    tid = str(task_id)
    await task_ws_manager.connect(tid, websocket)
    logger.info("task_ws connected task_id=%s user_id=%s", tid, current_user.id)
    try:
        await run_task_ws_receive_loop(tid, websocket)
    finally:
        await task_ws_manager.disconnect(tid, websocket)
        logger.info("task_ws disconnected task_id=%s user_id=%s", tid, current_user.id)


@router.websocket("/tasks/ws/global")
async def task_ws_global_endpoint(
    websocket: WebSocket,
    session_factory=Depends(get_ws_session_factory),
) -> None:
    """Authenticate then keep one user-scoped socket open for cross-view task notifications."""
    async with session_factory() as auth_session:
        async with auth_session.begin():
            try:
                current_user = await get_current_user_from_ws(websocket, auth_session)
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, str) else "Unauthorized"
                await websocket.close(code=4403, reason=detail[:120])
                return

    uid = str(current_user.id)
    await task_user_ws_manager.connect(uid, websocket)
    logger.info("task_ws_global connected user_id=%s", current_user.id)
    try:
        await run_task_ws_receive_loop("*", websocket)
    finally:
        await task_user_ws_manager.disconnect(uid, websocket)
        logger.info("task_ws_global disconnected user_id=%s", current_user.id)
