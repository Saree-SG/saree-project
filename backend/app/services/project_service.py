"""Project service — business logic for projects and level configs."""

from __future__ import annotations

import uuid

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org import ProjectMemberWithUserPublic, Role
from app.models.chat import ChatRoomPublic
from app.models.project import (
    DelayWarningPublic,
    DelayWarningsPublic,
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
    TaskLevelConfigCreate,
    TaskLevelConfigPublic,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.chat_repository import ChatRepository
from app.repositories.outbox_repository import OutboxRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.task_repository import TaskRepository
from app.services.delay_analyzer import ProjectDelayAnalyzer
from app.shared.task_realtime import broadcast_task_user_event


class ProjectService:
    """Orchestrates project domain business logic."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind service to an async session."""
        self._session = session
        self._project_repo = ProjectRepository(session)
        self._role_repo = RoleRepository(session)
        self._audit_repo = AuditRepository(session)
        self._outbox_repo = OutboxRepository(session)

    def _project_chat_member_role(self, project_user_id: uuid.UUID, project) -> str:
        """Return the ChatMember role for a given project user."""
        if project_user_id == project.created_by:
            return "owner"
        return "member"

    async def _sync_project_member_to_chat(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Ensure the given project user is an active member in the linked chat."""
        project = await self._project_repo.get_or_404(project_id)
        if not project.chat_room_id:
            return

        chat_repo = ChatRepository(self._session)
        role = self._project_chat_member_role(user_id, project)
        existing = await chat_repo.get_member(project.chat_room_id, user_id)

        if existing and existing.left_at is None:
            return

        if existing and existing.left_at is not None:
            existing.left_at = None
            existing.role = role
            self._session.add(existing)
            await self._session.flush()
            return

        await chat_repo.add_member(project.chat_room_id, user_id, role=role)

    async def _sync_project_member_remove_from_chat(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Remove (deactivate) the user from the linked project chat room."""
        project = await self._project_repo.get_or_404(project_id)
        if not project.chat_room_id:
            return

        chat_repo = ChatRepository(self._session)
        existing = await chat_repo.get_member(project.chat_room_id, user_id)
        if not existing or existing.left_at is not None:
            return

        existing.left_at = datetime.now(timezone.utc)
        self._session.add(existing)
        await self._session.flush()

    async def create_project_chat_room(
        self, project_id: uuid.UUID, current_user: User
    ) -> ChatRoomPublic:
        """Create a chat room for a project when missing, and link it to the project."""
        project = await self._project_repo.get_or_404(project_id)
        if project.chat_room_id:
            room = await ChatRepository(self._session).get_room_or_404(
                project.chat_room_id
            )
            return ChatRoomPublic(**room.model_dump())

        chat_repo = ChatRepository(self._session)
        room = await chat_repo.create_room(
            {
                "company_id": project.company_id,
                "room_type": "group",
                "name": f"Dự án: {project.name}",
                "room_color": None,
                "created_by": current_user.id,
            }
        )
        await chat_repo.add_member(room.id, project.created_by, role="owner")

        members = await self._project_repo.get_members(project.id)
        member_user_ids = {m.user_id for m in members}
        member_user_ids.discard(project.created_by)
        for member_user_id in member_user_ids:
            await chat_repo.add_member(room.id, member_user_id, role="member")

        project.chat_room_id = room.id
        await self._project_repo.save(project)

        await self._audit_repo.write(
            actor_id=current_user.id,
            action="project.chat_room_created",
            entity_type="project",
            entity_id=project.id,
            new_value={"chat_room_id": str(room.id)},
        )

        return ChatRoomPublic(**room.model_dump())

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
        """Create project, auto-create linked chat room, and add creator as member."""
        company_id = body.company_id or current_user.company_id
        pm_id = body.pm_id or current_user.id
        project = await self._project_repo.create_project({
            **body.model_dump(exclude={"company_id", "pm_id"}),
            "company_id": company_id,
            "pm_id": pm_id,
            "created_by": current_user.id,
            "is_deleted": False,
        })

        room = await ChatRepository(self._session).create_room(
            {
                "company_id": project.company_id,
                "room_type": "group",
                "name": f"Dự án: {project.name}",
                "room_color": None,
                "created_by": current_user.id,
            }
        )
        await ChatRepository(self._session).add_member(room.id, current_user.id, role="owner")
        project.chat_room_id = room.id
        await self._project_repo.save(project)

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
        await self._emit_project_user_notification(
            current_user.id,
            project.id,
            "project.assigned",
            {
                "actor_id": str(current_user.id),
                "project_name": project.name,
                "message": f'Bạn vừa được gán quản lý dự án "{project.name}".',
            },
        )

        return ProjectPublic(**project.model_dump())

    async def _emit_project_user_notification(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        event: str,
        data: dict,
    ) -> None:
        """Push one project-related event to a user-scoped websocket channel."""
        await broadcast_task_user_event(str(user_id), event, str(project_id), data)

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
        project = await self._project_repo.get_or_404(project_id)
        await self._project_repo.add_or_update_member(project_id, user_id, role_id)
        await self._sync_project_member_to_chat(project_id, user_id)
        await self._emit_project_user_notification(
            user_id,
            project_id,
            "project.assigned",
            {
                "project_name": project.name,
                "message": f'Bạn vừa được thêm vào dự án "{project.name}".',
            },
        )
        return {"message": "Member added/updated"}

    async def remove_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> dict:
        """Remove a member from a project."""
        await self._project_repo.remove_member(project_id, user_id)
        await self._sync_project_member_remove_from_chat(project_id, user_id)
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

    # ------------------------------------------------------------------
    # Delay warnings
    # ------------------------------------------------------------------

    async def get_delay_warnings(self, project_id: uuid.UUID) -> DelayWarningsPublic:
        """Run the 4-layer delay prediction engine for a project."""
        from datetime import timezone as _tz

        project = await self._project_repo.get_or_404(project_id)
        task_repo = TaskRepository(self._session)

        tasks = await task_repo.list_all_project_tasks(project_id)
        deps = await task_repo.list_project_dependencies(project_id)
        progress_by_task = await task_repo.bulk_sum_progress(project_id)

        analyzer = ProjectDelayAnalyzer(project, tasks, deps, progress_by_task)
        raw_warnings = analyzer.analyze()

        return DelayWarningsPublic(
            warnings=[
                DelayWarningPublic(
                    severity=w.severity,
                    layer=w.layer,
                    title=w.title,
                    detail=w.detail,
                    task_id=w.task_id,
                    task_name=w.task_name,
                    estimated_delay_days=w.estimated_delay_days,
                )
                for w in raw_warnings
            ],
            analyzed_at=datetime.now(_tz.utc),
        )
