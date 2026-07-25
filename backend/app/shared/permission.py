"""
Permission service — data-driven async RBAC check.

require_permission("TASK_CREATE") → FastAPI dependency.
Checks global role (company-wide) AND contextual role (project-level).

BUG FIX: project_id is now correctly extracted from path params and passed
into has_permission() so project-contextual roles are properly evaluated.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_async_db, get_current_user
from app.models.org import (
    Permission,
    Role,
    ProjectMemberRole,
    RolePermission,
    UserCompanyRole,
    UserGlobalRole,
)
from app.models.project import Project
from app.models.task import Task
from app.models.user import User

DIRECTOR_ROLE_NAMES = {"director", "giam_doc"}
MANAGER_AUTO_PERMISSION_CODES = {
    "PROJECT_VIEW",
    "PROJECT_VIEW_ALL",
    "PROJECT_CREATE",
    "PROJECT_UPDATE",
    "PROJECT_MANAGE_MEMBERS",
    "TASK_CREATE",
    "TASK_VIEW",
    "TASK_VIEW_ALL",
    "TASK_UPDATE",
    "TASK_UPDATE_STATUS",
    "TASK_REASSIGN",
    "TASK_DELETE",
    # Quotation — managers can view all and run reports
    "QUOTATION_VIEW",
    "QUOTATION_VIEW_ALL",
    "QUOTATION_REPORT",
    # Customer directory — managers (L1/L2) manage customer companies
    "CUSTOMER_VIEW",
    "CUSTOMER_CREATE",
    # Attendance — managers check in themselves, view team records, config sites
    "ATTENDANCE_CHECKIN",
    "ATTENDANCE_VIEW_TEAM",
    "ATTENDANCE_CONFIG_SITE",
}

# System-admin-only permissions. Company directors (L1) get every OTHER
# permission automatically, but NOT these — only the `admin` role / superusers
# may create tenants, manage users globally, or read the system audit log.
ADMIN_ONLY_PERMISSION_CODES = {
    "COMPANY_CREATE",
    "USER_MANAGE",
    "AUDIT_VIEW",
}


def _is_company_director_role(role: Role) -> bool:
    """Return True when role should be treated as company-director scope."""
    return role.level == 1 or role.name in DIRECTOR_ROLE_NAMES


def _is_company_manager_role(role: Role) -> bool:
    """Return True for company manager scope roles (level 1-2)."""
    return role.level <= 2


# ---------------------------------------------------------------------------
# Core permission resolution (async)
# ---------------------------------------------------------------------------

async def get_user_role_ids(
    session: AsyncSession,
    user_id: uuid.UUID,
    company_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """
    Collect all effective role IDs for a user in a single UNION ALL query.

    Includes:
      1. Global roles (UserGlobalRole)
      2. Company-scope roles (UserCompanyRole) — when company_id given
      3. Project-scope roles (ProjectMemberRole) — when project_id given
    """
    branches = [
        select(UserGlobalRole.role_id).where(UserGlobalRole.user_id == user_id)
    ]
    if company_id:
        branches.append(
            select(UserCompanyRole.role_id).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == company_id,
            )
        )
    if project_id:
        branches.append(
            select(ProjectMemberRole.role_id).where(
                ProjectMemberRole.user_id == user_id,
                ProjectMemberRole.project_id == project_id,
            )
        )
    result = await session.execute(union_all(*branches))
    return list({row[0] for row in result.all()})


async def has_permission(
    session: AsyncSession,
    user: User,
    permission_code: str,
    project_id: uuid.UUID | None = None,
    target_company_id: uuid.UUID | None = None,
) -> bool:
    """
    Return True when user holds the given permission code.

    Superusers always pass.
    project_id enables contextual (project-scope) role lookup.
    target_company_id is the company that owns the resource being accessed
    (e.g. the task's project's company). The company-wide director/manager
    auto-pass is scoped to the user's OWN company: a director of company A
    must NOT inherit blanket rights over company B's resources. When
    target_company_id is None (unknown / not a tenant-scoped resource) the
    auto-pass behaves as before for backward compatibility.
    """
    if user.is_superuser:
        return True

    role_ids = await get_user_role_ids(
        session,
        user.id,
        company_id=user.company_id,
        project_id=project_id,
    )
    if not role_ids:
        return False

    # The blanket director/manager auto-pass only applies when the resource
    # belongs to the user's own company (tenant isolation). Cross-tenant access
    # must go through an explicit project-scope role / RolePermission grant.
    same_company = target_company_id is None or target_company_id == user.company_id

    # Business rule: company director has full permissions within company scope
    # without explicit RolePermission rows.
    role_result = await session.execute(
        select(Role).where(Role.id.in_(role_ids))  # type: ignore[arg-type]
    )
    roles = role_result.scalars().all()
    # System admin role → unrestricted. Company director → everything except
    # the system-admin-only codes.
    if any(role.name == "admin" for role in roles):
        return True
    if same_company and any(_is_company_director_role(role) for role in roles):
        return permission_code not in ADMIN_ONLY_PERMISSION_CODES
    if (
        same_company
        and permission_code in MANAGER_AUTO_PERMISSION_CODES
        and any(_is_company_manager_role(role) for role in roles)
    ):
        return True

    match_result = await session.execute(
        select(RolePermission)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .where(
            RolePermission.role_id.in_(role_ids),  # type: ignore[arg-type]
            Permission.code == permission_code,
        )
    )
    return match_result.scalars().first() is not None


# ---------------------------------------------------------------------------
# Request-scope resolution
# ---------------------------------------------------------------------------

def _path_uuid(path_params: dict, key: str) -> uuid.UUID | None:
    """Parse a UUID path param, returning None when absent/invalid."""
    raw = path_params.get(key)
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


async def _resolve_request_scope(
    session: AsyncSession, path_params: dict
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """
    Resolve (project_id, company_id) of the resource targeted by a request.

    - Project routes carry {project_id} directly.
    - Task routes carry {task_id} or {parent_id}; we look up the owning project
      so project-scope roles are evaluated and tenant ownership is enforced.

    Returns (None, None) for routes that are not project/task scoped, preserving
    the previous (company-wide) behaviour for those endpoints.
    """
    project_id = _path_uuid(path_params, "project_id")
    if project_id is None:
        task_id = _path_uuid(path_params, "task_id") or _path_uuid(path_params, "parent_id")
        if task_id is not None:
            project_id = await session.scalar(
                select(Task.project_id).where(Task.id == task_id)
            )

    company_id: uuid.UUID | None = None
    if project_id is not None:
        company_id = await session.scalar(
            select(Project.company_id).where(Project.id == project_id)
        )
    return project_id, company_id


# ---------------------------------------------------------------------------
# FastAPI dependency factories (async)
# ---------------------------------------------------------------------------

def require_permission(permission_code: str):
    """
    FastAPI dependency factory — user must hold the given permission.

    project_id is automatically extracted from path params (e.g. /projects/{project_id}/...)
    so that contextual project-scope roles are evaluated correctly.

    Usage:
        @router.post("/projects/{project_id}/tasks")
        async def create_task(
            project_id: uuid.UUID,
            current_user: User = Depends(require_permission("TASK_CREATE")),
        ):
            ...
    """

    async def _check(
        request: Request,
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_async_db),
    ) -> User:
        """Enforce permission check with project + tenant context when available."""
        if current_user.is_superuser:
            return current_user

        project_id, company_id = await _resolve_request_scope(
            session, request.path_params
        )

        if not await has_permission(
            session, current_user, permission_code, project_id, company_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission_code}' required.",
            )
        return current_user

    return _check


def require_any_permission(*permission_codes: str):
    """
    FastAPI dependency — user must hold at least one of the listed permissions.
    Also extracts project_id from path params for contextual evaluation.
    """

    async def _check(
        request: Request,
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_async_db),
    ) -> User:
        """Enforce at-least-one permission check with a single batched DB round-trip."""
        if current_user.is_superuser:
            return current_user

        project_id, company_id = await _resolve_request_scope(
            session, request.path_params
        )
        same_company = company_id is None or company_id == current_user.company_id

        role_ids = await get_user_role_ids(
            session,
            current_user.id,
            company_id=current_user.company_id,
            project_id=project_id,
        )
        if not role_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of permissions {list(permission_codes)} required.",
            )

        role_result = await session.execute(
            select(Role).where(Role.id.in_(role_ids))  # type: ignore[arg-type]
        )
        roles = role_result.scalars().all()

        if same_company and any(_is_company_director_role(role) for role in roles):
            return current_user
        codes_set = set(permission_codes)
        if same_company and codes_set & MANAGER_AUTO_PERMISSION_CODES and any(
            _is_company_manager_role(role) for role in roles
        ):
            return current_user

        match_result = await session.execute(
            select(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                RolePermission.role_id.in_(role_ids),  # type: ignore[arg-type]
                Permission.code.in_(list(permission_codes)),
            )
        )
        if match_result.scalars().first() is not None:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"One of permissions {list(permission_codes)} required.",
        )

    return _check
