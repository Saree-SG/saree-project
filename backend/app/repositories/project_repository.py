"""Project domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database.repository import BaseRepository
from app.models.org import Department, ProjectMemberRole
from app.models.project import Project, TaskLevelConfig

# Projects in these states are hidden from the timeline overview by default —
# mirrors the demo, which only charts work still in flight.
FINISHED_PROJECT_STATUSES = ("completed", "cancelled")


class ProjectRepository(BaseRepository[Project]):
    """Async repository for Project and TaskLevelConfig entities."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to Project model and session."""
        super().__init__(Project, session)

    # ------------------------------------------------------------------
    # Project fetches
    # ------------------------------------------------------------------

    async def get_or_404(self, project_id: uuid.UUID) -> Project:
        """Load project; raise 404 if not found or soft-deleted."""
        project = await self.get_by_id(project_id)
        if not project or project.is_deleted:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    async def list_for_user(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID,
        is_superuser: bool,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[Project], int]:
        """
        Return paginated projects visible to user.
        Superusers see all; others see only member projects.
        """
        stmt = select(Project).where(
            Project.company_id == company_id,
            Project.is_deleted == False,  # noqa: E712
        )
        if not is_superuser:
            member_ids_stmt = select(ProjectMemberRole.project_id).where(
                ProjectMemberRole.user_id == user_id
            )
            member_result = await self._execute(member_ids_stmt)
            member_project_ids = member_result.scalars().all()
            # Also include projects created by this user (e.g. internal projects
            # where they may not have been added as a formal member yet)
            stmt = stmt.where(
                or_(
                    Project.id.in_(member_project_ids),  # type: ignore[arg-type]
                    Project.created_by == user_id,
                )
            )

        if status_filter:
            stmt = stmt.where(Project.status == status_filter)

        count_result = await self._execute(select(func.count()).select_from(stmt.subquery()))
        total: int = count_result.scalar_one()

        result = await self._execute(stmt.offset(skip).limit(limit))
        return result.scalars().all(), total

    async def list_timeline_for_user(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID,
        company_wide: bool,
        department_id: uuid.UUID | None = None,
        include_finished: bool = False,
    ) -> Sequence[tuple[Project, str | None]]:
        """Return (project, department_name) for the timeline overview.

        Unpaginated on purpose — the overview charts every project the user can see
        on one axis, and paging would break the shared time scale.

        `company_wide` = the caller oversees the whole company (board/manager, see
        has_company_wide_scope) and gets every project in it. Everyone else sees
        only projects they belong to or created.
        """
        stmt = (
            select(Project, Department.name)
            .outerjoin(Department, Department.id == Project.department_id)
            .where(
                Project.company_id == company_id,
                Project.is_deleted == False,  # noqa: E712
            )
            .order_by(Project.start_date, Project.name)
        )
        if not company_wide:
            member_ids_stmt = select(ProjectMemberRole.project_id).where(
                ProjectMemberRole.user_id == user_id
            )
            member_result = await self._execute(member_ids_stmt)
            member_project_ids = member_result.scalars().all()
            stmt = stmt.where(
                or_(
                    Project.id.in_(member_project_ids),  # type: ignore[arg-type]
                    Project.created_by == user_id,
                )
            )
        if department_id:
            stmt = stmt.where(Project.department_id == department_id)
        if not include_finished:
            stmt = stmt.where(
                Project.status.notin_(FINISHED_PROJECT_STATUSES)  # type: ignore[attr-defined]
            )

        result = await self._execute(stmt)
        return result.all()  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Project writes
    # ------------------------------------------------------------------

    async def create_project(self, data: dict) -> Project:
        """Insert a new project."""
        return await self.add(data)

    async def update_project(self, project: Project, update_data: dict) -> Project:
        """Apply partial update fields to a project."""
        for field, val in update_data.items():
            setattr(project, field, val)
        return await self.save(project)

    async def soft_delete(self, project: Project) -> None:
        """Soft-delete a project."""
        from datetime import datetime, timezone
        project.is_deleted = True
        project.deleted_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._session.add(project)

    # ------------------------------------------------------------------
    # Members
    # ------------------------------------------------------------------

    async def get_members(self, project_id: uuid.UUID) -> Sequence[ProjectMemberRole]:
        """Return all member rows with eager-loaded user and role."""
        stmt = (
            select(ProjectMemberRole)
            .where(ProjectMemberRole.project_id == project_id)
            .options(
                joinedload(ProjectMemberRole.user),  # type: ignore[arg-type]
                joinedload(ProjectMemberRole.role),  # type: ignore[arg-type]
            )
        )
        result = await self._execute(stmt)
        return result.unique().scalars().all()

    async def get_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectMemberRole | None:
        """Return membership row or None."""
        stmt = select(ProjectMemberRole).where(
            ProjectMemberRole.project_id == project_id,
            ProjectMemberRole.user_id == user_id,
        )
        result = await self._execute(stmt)
        return result.scalars().first()

    async def add_or_update_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID
    ) -> ProjectMemberRole:
        """Upsert project membership."""
        existing = await self.get_member(project_id, user_id)
        if existing:
            existing.role_id = role_id
            self._session.add(existing)
            await self._session.flush()
            return existing
        member = ProjectMemberRole(
            project_id=project_id, user_id=user_id, role_id=role_id
        )
        self._session.add(member)
        await self._session.flush()
        return member

    async def remove_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Remove a member from a project."""
        m = await self.get_member(project_id, user_id)
        if m:
            await self._session.delete(m)

    # ------------------------------------------------------------------
    # TaskLevelConfig
    # ------------------------------------------------------------------

    async def get_level_config(
        self, project_id: uuid.UUID, level: int
    ) -> TaskLevelConfig | None:
        """Return TaskLevelConfig for a level or None."""
        stmt = select(TaskLevelConfig).where(
            TaskLevelConfig.project_id == project_id,
            TaskLevelConfig.level == level,
        )
        result = await self._execute(stmt)
        return result.scalars().first()

    async def list_level_configs(self, project_id: uuid.UUID) -> Sequence[TaskLevelConfig]:
        """Return all level configs ordered by level asc."""
        stmt = (
            select(TaskLevelConfig)
            .where(TaskLevelConfig.project_id == project_id)
            .order_by(TaskLevelConfig.level)
        )
        result = await self._execute(stmt)
        return result.scalars().all()

    async def upsert_level_config(
        self, project_id: uuid.UUID, data: dict
    ) -> TaskLevelConfig:
        """Insert or update TaskLevelConfig for a given level."""
        existing = await self.get_level_config(project_id, data["level"])
        if existing:
            for field, val in data.items():
                setattr(existing, field, val)
            self._session.add(existing)
            await self._session.flush()
            await self._session.refresh(existing)
            return existing
        cfg = TaskLevelConfig(project_id=project_id, **data)
        self._session.add(cfg)
        await self._session.flush()
        await self._session.refresh(cfg)
        return cfg
