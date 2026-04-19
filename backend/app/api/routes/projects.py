"""
Project management routes — full async, no direct DB calls.
All DB operations delegated to ProjectService.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.chat import ChatRoomPublic
from app.models.org import ProjectMemberWithUserPublic
from app.models.project import (
    DelayWarningsPublic,
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
    TaskLevelConfigCreate,
    TaskLevelConfigPublic,
)
from app.models.user import User
from app.services.project_service import ProjectService
from app.shared.permission import require_permission

router = APIRouter(prefix="/projects", tags=["projects"])


def _svc(session: AsyncSession) -> ProjectService:
    """Build a ProjectService bound to the request session."""
    return ProjectService(session)


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=ProjectsPublic)
async def list_projects(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = 0,
    limit: int = 50,
) -> ProjectsPublic:
    """List projects visible to current user."""
    return await _svc(session).list_projects(
        current_user, status_filter=status_filter, skip=skip, limit=limit
    )


@router.post("/", response_model=ProjectPublic, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROJECT_CREATE")),
) -> ProjectPublic:
    """Create a project; add creator as member automatically."""
    return await _svc(session).create_project(body, current_user)


@router.get("/{project_id}", response_model=ProjectPublic)
async def get_project(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> ProjectPublic:
    """Return a project by ID."""
    return await _svc(session).get_project(project_id)


@router.patch("/{project_id}", response_model=ProjectPublic)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROJECT_UPDATE")),
) -> ProjectPublic:
    """Apply partial updates to a project."""
    return await _svc(session).update_project(project_id, body, current_user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROJECT_UPDATE")),
) -> None:
    """Soft-delete a project."""
    await _svc(session).delete_project(project_id, current_user)


# ---------------------------------------------------------------------------
# TaskLevelConfig (hierarchy setup per project)
# ---------------------------------------------------------------------------

@router.post(
    "/{project_id}/level-config",
    response_model=TaskLevelConfigPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_level_config(
    project_id: uuid.UUID,
    body: TaskLevelConfigCreate,
    session: AsyncSessionDep,
    _current_user: User = Depends(require_permission("PROJECT_UPDATE")),
) -> TaskLevelConfigPublic:
    """Add or replace a task level in project hierarchy."""
    return await _svc(session).upsert_level_config(project_id, body, _current_user)


@router.get("/{project_id}/level-config", response_model=list[TaskLevelConfigPublic])
async def get_level_configs(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[TaskLevelConfigPublic]:
    """List level configs for a project."""
    return await _svc(session).list_level_configs(project_id)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/{project_id}/members", response_model=list[ProjectMemberWithUserPublic])
async def get_members(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[ProjectMemberWithUserPublic]:
    """List project members with user info."""
    return await _svc(session).get_members(project_id)


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: User = Depends(require_permission("PROJECT_MANAGE_MEMBERS")),
    user_id: uuid.UUID = Query(...),
    role_id: uuid.UUID = Query(...),
) -> dict:
    """Add or update a project member."""
    return await _svc(session).add_member(project_id, user_id, role_id)


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: User = Depends(require_permission("PROJECT_MANAGE_MEMBERS")),
) -> None:
    """Remove a member from a project."""
    await _svc(session).remove_member(project_id, user_id)


@router.get("/{project_id}/delay-warnings", response_model=DelayWarningsPublic)
async def get_delay_warnings(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> DelayWarningsPublic:
    """Run 4-layer delay prediction for a project and return all active warnings."""
    return await _svc(session).get_delay_warnings(project_id)


@router.post(
    "/{project_id}/create-chat-room",
    response_model=ChatRoomPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_chat_room(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROJECT_MANAGE_MEMBERS")),
) -> ChatRoomPublic:
    """Create a project-linked chat room when missing."""
    return await _svc(session).create_project_chat_room(project_id, current_user)
