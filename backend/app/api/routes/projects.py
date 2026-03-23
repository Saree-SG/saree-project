"""
Project API router.
Routes: /projects/
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, get_db
from app.models.org import ProjectMemberRole, Role
from app.models.project import (
    Project,
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
    TaskLevelConfig,
    TaskLevelConfigCreate,
    TaskLevelConfigPublic,
)
from app.models.user import User
from app.shared.audit import write_audit_log
from app.shared.event_bus import event_bus
from app.shared.permission import require_permission

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=ProjectsPublic)
def list_projects(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = 0,
    limit: int = 50,
):
    """List projects visible to current user."""
    q = select(Project).where(Project.is_deleted == False)  # noqa: E712
    if not current_user.is_superuser:
        # Non-superusers only see projects they're members of
        member_project_ids = session.exec(
            select(ProjectMemberRole.project_id).where(
                ProjectMemberRole.user_id == current_user.id
            )
        ).all()
        q = q.where(Project.id.in_(member_project_ids))  # type: ignore[attr-defined]

    if status_filter:
        q = q.where(Project.status == status_filter)

    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    projects = session.exec(q.offset(skip).limit(limit)).all()
    return ProjectsPublic(data=projects, count=total)


@router.post("/", response_model=ProjectPublic, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROJECT_CREATE")),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    project = Project(
        **body.model_dump(),
        company_id=current_user.company_id,  # type: ignore[arg-type]
        pm_id=current_user.id,
        created_by=current_user.id,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # Auto-add creator as project member with Manager role
    write_audit_log(session, current_user.id, "project.created", "project", project.id,
                    new_value={"name": project.name})
    session.commit()

    background_tasks.add_task(
        event_bus.emit, "project.created", {"project_id": str(project.id)}
    )
    return project


@router.get("/{project_id}", response_model=ProjectPublic)
def get_project(
    project_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = session.get(Project, project_id)
    if not project or project.is_deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectPublic)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROJECT_UPDATE")),
):
    project = session.get(Project, project_id)
    if not project or project.is_deleted:
        raise HTTPException(404, "Project not found")

    old_data = project.model_dump()
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    session.add(project)
    write_audit_log(session, current_user.id, "project.updated", "project", project.id,
                    old_value=old_data, new_value=update_data)
    session.commit()
    session.refresh(project)
    return project


# ---------------------------------------------------------------------------
# Task Level Config (hierarchy setup per project)
# ---------------------------------------------------------------------------

@router.post("/{project_id}/level-config", response_model=TaskLevelConfigPublic,
             status_code=status.HTTP_201_CREATED)
def upsert_level_config(
    project_id: uuid.UUID,
    body: TaskLevelConfigCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROJECT_UPDATE")),
):
    """Add or replace a task level in project hierarchy."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Check if level already exists
    existing = session.exec(
        select(TaskLevelConfig).where(
            TaskLevelConfig.project_id == project_id,
            TaskLevelConfig.level == body.level,
        )
    ).first()

    role_ids = [str(r) for r in body.assignable_role_ids] if body.assignable_role_ids else None

    if existing:
        existing.label = body.label
        existing.requires_proof = body.requires_proof
        existing.can_have_children = body.can_have_children
        existing.max_children = body.max_children
        existing.assignable_role_ids = role_ids
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    cfg = TaskLevelConfig(
        project_id=project_id,
        level=body.level,
        label=body.label,
        requires_proof=body.requires_proof,
        can_have_children=body.can_have_children,
        max_children=body.max_children,
        assignable_role_ids=role_ids,
    )
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg


@router.get("/{project_id}/level-config", response_model=list[TaskLevelConfigPublic])
def get_level_configs(
    project_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    configs = session.exec(
        select(TaskLevelConfig)
        .where(TaskLevelConfig.project_id == project_id)
        .order_by(TaskLevelConfig.level)
    ).all()
    return configs


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/{project_id}/members", response_model=list[dict])
def get_members(
    project_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    members = session.exec(
        select(ProjectMemberRole).where(ProjectMemberRole.project_id == project_id)
    ).all()
    return [
        {
            "user_id": str(m.user_id),
            "role_id": str(m.role_id),
            "joined_at": m.joined_at.isoformat(),
        }
        for m in members
    ]


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROJECT_MANAGE_MEMBERS")),
):
    existing = session.exec(
        select(ProjectMemberRole).where(
            ProjectMemberRole.project_id == project_id,
            ProjectMemberRole.user_id == user_id,
        )
    ).first()
    if existing:
        existing.role_id = role_id
        session.add(existing)
    else:
        member = ProjectMemberRole(project_id=project_id, user_id=user_id, role_id=role_id)
        session.add(member)
    session.commit()
    return {"message": "Member added/updated"}
