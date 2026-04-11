"""Project service — business logic for projects and level configs."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org import ProjectMemberWithUserPublic, Role
from app.models.project import (
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
    TaskLevelConfigCreate,
    TaskLevelConfigPublic,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.outbox_repository import OutboxRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.role_repository import RoleRepository


class ProjectService:
    """Orchestrates project domain business logic."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind service to an async session."""
        self._session = session
        self._project_repo = ProjectRepository(session)
        self._role_repo = RoleRepository(session)
        self._audit_repo = AuditRepository(session)
        self._outbox_repo = OutboxRepository(session)

    # ------------------------------------------------------------------
    # List / Get
    # ------------------------------------------------------------------

    async def list_projects(
        self,
        current_user: User,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> ProjectsPublic:
        """Return projects visible to the current user."""
        if not current_user.company_id:
            return ProjectsPublic(data=[], count=0)

        projects, total = await self._project_repo.list_for_user(
            company_id=current_user.company_id,
            user_id=current_user.id,
            is_superuser=current_user.is_superuser,
            status_filter=status_filter,
            skip=skip,
            limit=limit,
        )
        return ProjectsPublic(data=list(projects), count=total)

    async def get_project(self, project_id: uuid.UUID) -> ProjectPublic:
        """Return project or raise 404."""
        project = await self._project_repo.get_or_404(project_id)
        return ProjectPublic(**project.model_dump())

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create_project(
        self, body: ProjectCreate, current_user: User
    ) -> ProjectPublic:
        """Create project and auto-add creator as member."""
        project = await self._project_repo.create_project({
            **body.model_dump(),
            "company_id": current_user.company_id,
            "pm_id": current_user.id,
            "created_by": current_user.id,
            "is_deleted": False,
        })

        creator_role = await self._get_director_or_manager_role(
            project.company_id  # type: ignore[arg-type]
        )
        if creator_role:
            await self._project_repo.add_or_update_member(
                project.id, current_user.id, creator_role.id
            )

        await self._audit_repo.write(
            actor_id=current_user.id,
            action="project.created",
            entity_type="project",
            entity_id=project.id,
            new_value={"name": project.name},
        )
        await self._outbox_repo.create_event(
            "project.created", {"project_id": str(project.id)}
        )

        return ProjectPublic(**project.model_dump())

    async def _get_director_or_manager_role(
        self, company_id: uuid.UUID
    ) -> Role | None:
        """Return the first director/manager role in a company or None."""
        from sqlalchemy import select
        result = await self._session.execute(
            select(Role).where(
                Role.company_id == company_id,
                Role.name.in_(["director", "manager"]),  # type: ignore[attr-defined]
            )
        )
        return result.scalars().first()

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update_project(
        self, project_id: uuid.UUID, body: ProjectUpdate, current_user: User
    ) -> ProjectPublic:
        """Apply partial updates to a project."""
        project = await self._project_repo.get_or_404(project_id)
        old_data = project.model_dump()
        update_data = body.model_dump(exclude_unset=True)

        project = await self._project_repo.update_project(project, update_data)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="project.updated",
            entity_type="project",
            entity_id=project.id,
            old_value=old_data,
            new_value=update_data,
        )

        return ProjectPublic(**project.model_dump())

    async def delete_project(
        self, project_id: uuid.UUID, current_user: User
    ) -> None:
        """Soft-delete a project."""
        project = await self._project_repo.get_or_404(project_id)
        await self._project_repo.soft_delete(project)
        await self._audit_repo.write(
            actor_id=current_user.id,
            action="project.deleted",
            entity_type="project",
            entity_id=project.id,
        )

    # ------------------------------------------------------------------
    # Members
    # ------------------------------------------------------------------

    async def get_members(
        self, project_id: uuid.UUID
    ) -> list[ProjectMemberWithUserPublic]:
        """Return project members with user and role info."""
        members = await self._project_repo.get_members(project_id)
        return [
            ProjectMemberWithUserPublic(
                user_id=m.user_id,
                role_id=m.role_id,
                joined_at=m.joined_at,
                full_name=m.user.full_name,
                email=m.user.email,
                role_display_name=m.role.display_name,
            )
            for m in members
        ]

    async def add_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID
    ) -> dict:
        """Add or update a project member."""
        await self._project_repo.add_or_update_member(project_id, user_id, role_id)
        return {"message": "Member added/updated"}

    async def remove_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> dict:
        """Remove a member from a project."""
        await self._project_repo.remove_member(project_id, user_id)
        return {"message": "Member removed"}

    # ------------------------------------------------------------------
    # Level configs
    # ------------------------------------------------------------------

    async def upsert_level_config(
        self, project_id: uuid.UUID, body: TaskLevelConfigCreate, current_user: User
    ) -> TaskLevelConfigPublic:
        """Upsert a task level config for a project."""
        await self._project_repo.get_or_404(project_id)
        role_ids = (
            [str(r) for r in body.assignable_role_ids]
            if body.assignable_role_ids
            else None
        )
        data = {
            "level": body.level,
            "label": body.label,
            "requires_proof": body.requires_proof,
            "can_have_children": body.can_have_children,
            "max_children": body.max_children,
            "assignable_role_ids": role_ids,
        }
        cfg = await self._project_repo.upsert_level_config(project_id, data)
        return TaskLevelConfigPublic(**cfg.model_dump())

    async def list_level_configs(
        self, project_id: uuid.UUID
    ) -> list[TaskLevelConfigPublic]:
        """Return all level configs for a project."""
        configs = await self._project_repo.list_level_configs(project_id)
        return [TaskLevelConfigPublic(**c.model_dump()) for c in configs]
