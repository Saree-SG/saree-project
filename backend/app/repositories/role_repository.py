"""Role / RBAC domain repository."""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.org import (
    Company,
    Department,
    Permission,
    ProjectMemberRole,
    Role,
    RoleDependency,
    RolePermission,
    UserCompanyRole,
    UserGlobalRole,
)


class RoleRepository(BaseRepository[Role]):
    """Async repository for Role, Permission, and related org models."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind to Role model and session."""
        super().__init__(Role, session)

    # ------------------------------------------------------------------
    # Company
    # ------------------------------------------------------------------

    async def get_company(self, company_id: uuid.UUID) -> Company | None:
        """Fetch company by PK."""
        return await self._session.get(Company, company_id)

    async def get_company_or_404(self, company_id: uuid.UUID) -> Company:
        """Fetch company or raise 404."""
        company = await self.get_company(company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        return company

    async def get_company_by_slug(self, slug: str) -> Company | None:
        """Return company by slug."""
        result = await self._execute(select(Company).where(Company.slug == slug))
        return result.scalars().first()

    async def list_companies(self) -> Sequence[Company]:
        """List all companies ordered by created_at desc."""
        result = await self._execute(
            select(Company).order_by(Company.created_at.desc())  # type: ignore[attr-defined]
        )
        return result.scalars().all()

    async def create_company(self, data: dict) -> Company:
        """Insert a new company."""
        company = Company(**data)
        self._session.add(company)
        await self._session.flush()
        await self._session.refresh(company)
        return company

    async def update_company(self, company: Company, data: dict) -> Company:
        """Apply partial update to a company."""
        for field, val in data.items():
            setattr(company, field, val)
        self._session.add(company)
        await self._session.flush()
        await self._session.refresh(company)
        return company

    # ------------------------------------------------------------------
    # Department
    # ------------------------------------------------------------------

    async def get_department(self, dept_id: uuid.UUID) -> Department | None:
        """Fetch department by PK."""
        return await self._session.get(Department, dept_id)

    async def list_departments(self, company_id: uuid.UUID) -> Sequence[Department]:
        """List departments for a company."""
        result = await self._execute(
            select(Department).where(Department.company_id == company_id)
        )
        return result.scalars().all()

    async def create_department(self, data: dict) -> Department:
        """Insert a new department."""
        dept = Department(**data)
        self._session.add(dept)
        await self._session.flush()
        await self._session.refresh(dept)
        return dept

    # ------------------------------------------------------------------
    # Role
    # ------------------------------------------------------------------

    async def get_role_or_404(self, role_id: uuid.UUID) -> Role:
        """Fetch role or raise 404."""
        role = await self.get_by_id(role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role

    async def get_role_by_name(self, company_id: uuid.UUID, name: str) -> Role | None:
        """Return role by normalized name in company scope."""
        result = await self._execute(
            select(Role).where(Role.company_id == company_id, Role.name == name)
        )
        return result.scalars().first()

    async def list_company_roles(
        self, company_id: uuid.UUID, *, exclude_admin: bool = False
    ) -> Sequence[Role]:
        """Return all roles in a company; optionally exclude admin role."""
        stmt = select(Role).where(Role.company_id == company_id)
        if exclude_admin:
            stmt = stmt.where(Role.name != "admin")
        result = await self._execute(stmt)
        return result.scalars().all()

    async def create_role(self, data: dict) -> Role:
        """Insert a new custom role."""
        role = Role(**data)
        self._session.add(role)
        await self._session.flush()
        await self._session.refresh(role)
        return role

    async def delete_role(self, role: Role) -> None:
        """Hard-delete a non-system role."""
        if role.is_system:
            raise HTTPException(status_code=422, detail="System roles cannot be deleted")
        await self._session.delete(role)

    # ------------------------------------------------------------------
    # Permission
    # ------------------------------------------------------------------

    async def get_permission_by_code(self, code: str) -> Permission | None:
        """Return permission by code."""
        result = await self._execute(select(Permission).where(Permission.code == code))
        return result.scalars().first()

    async def list_permissions_for_roles(
        self, role_ids: list[uuid.UUID]
    ) -> Sequence[RolePermission]:
        """Return all RolePermission rows for a set of role IDs."""
        if not role_ids:
            return []
        result = await self._execute(
            select(RolePermission).where(
                RolePermission.role_id.in_(role_ids)  # type: ignore[arg-type]
            )
        )
        return result.scalars().all()

    async def get_permission_ids_for_roles(
        self, role_ids: list[uuid.UUID]
    ) -> set[uuid.UUID]:
        """Return the set of permission IDs held by the given roles."""
        rows = await self.list_permissions_for_roles(role_ids)
        return {row.permission_id for row in rows}

    # ------------------------------------------------------------------
    # User role assignments
    # ------------------------------------------------------------------

    async def get_user_role_ids(
        self,
        user_id: uuid.UUID,
        company_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
    ) -> list[uuid.UUID]:
        """
        Collect all effective role IDs for a user.

        Priority order:
          1. Global roles (UserGlobalRole)
          2. Company roles (UserCompanyRole) — filtered by company_id if given
          3. Project roles (ProjectMemberRole) — included when project_id is given
        """
        role_ids: set[uuid.UUID] = set()

        global_result = await self._execute(
            select(UserGlobalRole).where(UserGlobalRole.user_id == user_id)
        )
        role_ids.update(r.role_id for r in global_result.scalars().all())

        if company_id:
            company_result = await self._execute(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == user_id,
                    UserCompanyRole.company_id == company_id,
                )
            )
            role_ids.update(r.role_id for r in company_result.scalars().all())

        if project_id:
            project_result = await self._execute(
                select(ProjectMemberRole).where(
                    ProjectMemberRole.user_id == user_id,
                    ProjectMemberRole.project_id == project_id,
                )
            )
            role_ids.update(r.role_id for r in project_result.scalars().all())

        return list(role_ids)

    async def get_user_company_roles(
        self, user_id: uuid.UUID, company_id: uuid.UUID
    ) -> Sequence[UserCompanyRole]:
        """Return company-role assignments for a user."""
        result = await self._execute(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == company_id,
            )
        )
        return result.scalars().all()

    async def assign_company_role(
        self,
        user_id: uuid.UUID,
        company_id: uuid.UUID,
        role_id: uuid.UUID,
        is_primary: bool,
    ) -> UserCompanyRole:
        """Add or update a user's company-role assignment."""
        stmt = select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
        result = await self._execute(stmt)
        existing = result.scalars().first()
        if existing:
            existing.is_primary = is_primary
            self._session.add(existing)
            await self._session.flush()
            return existing
        assignment = UserCompanyRole(
            user_id=user_id,
            company_id=company_id,
            role_id=role_id,
            is_primary=is_primary,
        )
        self._session.add(assignment)
        await self._session.flush()
        return assignment

    async def remove_company_role(
        self, user_id: uuid.UUID, company_id: uuid.UUID, role_id: uuid.UUID
    ) -> None:
        """Remove a specific company-role assignment."""
        stmt = select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
        result = await self._execute(stmt)
        row = result.scalars().first()
        if row:
            await self._session.delete(row)

    # ------------------------------------------------------------------
    # Role Dependencies (org chart / REPORTS_TO)
    # ------------------------------------------------------------------

    async def list_role_dependencies(
        self,
        company_id: uuid.UUID,
        relation_type: str | None = None,
    ) -> Sequence[RoleDependency]:
        """Return role dependency rows for a company with optional filter."""
        stmt = select(RoleDependency).where(RoleDependency.company_id == company_id)
        if relation_type:
            stmt = stmt.where(RoleDependency.relation_type == relation_type)
        result = await self._execute(stmt)
        return result.scalars().all()

    async def create_role_dependency(self, data: dict) -> RoleDependency:
        """Insert a new role dependency."""
        dep = RoleDependency(**data)
        self._session.add(dep)
        await self._session.flush()
        await self._session.refresh(dep)
        return dep

    async def delete_role_dependency(self, dep_id: uuid.UUID) -> None:
        """Delete a role dependency by PK."""
        dep = await self._session.get(RoleDependency, dep_id)
        if dep:
            await self._session.delete(dep)

    async def check_reports_to_cycle(
        self,
        company_id: uuid.UUID,
        from_role_id: uuid.UUID,
        to_role_id: uuid.UUID,
    ) -> None:
        """Raise 422 if adding this REPORTS_TO link would create a cycle."""
        rows = await self.list_role_dependencies(company_id, "REPORTS_TO")
        graph: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
        for row in rows:
            graph[row.from_role_id].add(row.to_role_id)
        graph[from_role_id].add(to_role_id)

        stack = [to_role_id]
        visited: set[uuid.UUID] = set()
        while stack:
            node = stack.pop()
            if node == from_role_id:
                raise HTTPException(422, "Circular REPORTS_TO dependency detected")
            if node in visited:
                continue
            visited.add(node)
            stack.extend(graph.get(node, set()))
