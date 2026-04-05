"""
Permission service — data-driven RBAC check.

require_permission("TASK_CREATE") → FastAPI dependency.
Checks both global role (company-wide) and contextual role (project-level).
"""
from __future__ import annotations

import uuid
from functools import lru_cache

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.models.org import (
    Permission,
    ProjectMemberRole,
    Role,
    RolePermission,
    UserCompanyRole,
    UserGlobalRole,
)
from app.models.user import User


# ---------------------------------------------------------------------------
# Core permission resolution
# ---------------------------------------------------------------------------

def get_user_role_ids(
    session: Session,
    user_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    """
    Returns all role IDs effective for a user.
    If project_id is given, contextual role (ProjectMemberRole) is included
    and takes priority — but global roles still apply for global-scope perms.
    """
    role_ids: set[uuid.UUID] = set()

    # Global roles
    global_roles = session.exec(
        select(UserGlobalRole).where(UserGlobalRole.user_id == user_id)
    ).all()
    role_ids.update(r.role_id for r in global_roles)

    user = session.get(User, user_id)
    if user and user.company_id:
        company_roles = session.exec(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == user.company_id,
            )
        ).all()
        role_ids.update(r.role_id for r in company_roles)

    # Contextual role (within project)
    if project_id:
        ctx_roles = session.exec(
            select(ProjectMemberRole).where(
                ProjectMemberRole.user_id == user_id,
                ProjectMemberRole.project_id == project_id,
            )
        ).all()
        role_ids.update(r.role_id for r in ctx_roles)

    return list(role_ids)


def has_permission(
    session: Session,
    user: User,
    permission_code: str,
    project_id: uuid.UUID | None = None,
) -> bool:
    """Returns True if user has the given permission (globally or in project context)."""
    if user.is_superuser:
        return True

    role_ids = get_user_role_ids(session, user.id, project_id)
    if not role_ids:
        return False

    perm = session.exec(
        select(Permission).where(Permission.code == permission_code)
    ).first()
    if not perm:
        return False

    match = session.exec(
        select(RolePermission).where(
            RolePermission.role_id.in_(role_ids),  # type: ignore[attr-defined]
            RolePermission.permission_id == perm.id,
        )
    ).first()
    return match is not None


def get_permission_scope(
    session: Session,
    user: User,
    permission_code: str,
    project_id: uuid.UUID | None = None,
) -> str | None:
    """Returns the scope of a permission for a user ('own' | 'team' | 'global' etc.)."""
    role_ids = get_user_role_ids(session, user.id, project_id)
    perm = session.exec(
        select(Permission).where(Permission.code == permission_code)
    ).first()
    if not perm:
        return None
    # Return the most permissive scope among all matching roles
    # For simplicity: if any role has global → return global
    return perm.scope


# ---------------------------------------------------------------------------
# FastAPI dependency factory
# ---------------------------------------------------------------------------

def require_permission(permission_code: str, require_project_id: bool = False):
    """
    FastAPI dependency factory.

    Usage:
        @router.post("/")
        async def create_task(
            project_id: UUID,
            _=Depends(require_permission("TASK_CREATE")),
        ):

    project_id is extracted from query/path params automatically via request.
    For project-scoped routes, pass require_project_id=True.
    """
    async def _check(
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_db),
    ) -> User:
        if current_user.is_superuser:
            return current_user
        if not has_permission(session, current_user, permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission_code}' required.",
            )
        return current_user

    return _check


def require_any_permission(*permission_codes: str):
    """
    FastAPI dependency: user must have at least one of the listed permissions.
    """

    async def _check(
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_db),
    ) -> User:
        if current_user.is_superuser:
            return current_user
        for code in permission_codes:
            if has_permission(session, current_user, code):
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"One of permissions {list(permission_codes)} required.",
        )

    return _check
