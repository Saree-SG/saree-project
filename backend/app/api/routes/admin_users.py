"""Admin user management endpoints — rich list, detail, atomic membership ops."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import AsyncSessionDep, get_current_active_superuser
from app.core.auth.session_service import get_session_service
from app.models.org import (
    Company,
    Department,
    Permission,
    Role,
    RolePermission,
    UserCompanyRole,
)
from app.models.user import LoginHistory, User
from app.shared.permission import (
    MANAGER_AUTO_PERMISSION_CODES,
    get_user_role_ids,
)

_DIRECTOR_ROLE_NAMES = {"director", "giam_doc"}

router = APIRouter(
    prefix="/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(get_current_active_superuser)],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class AdminUserListRow(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    is_active: bool
    is_superuser: bool
    company_id: uuid.UUID | None
    company_name: str | None
    department_id: uuid.UUID | None
    department_name: str | None
    primary_role_id: uuid.UUID | None
    primary_role_name: str | None
    primary_role_display_name: str | None
    primary_role_level: int | None
    last_login_at: datetime | None
    created_at: datetime | None


class AdminUserMembership(BaseModel):
    company_id: uuid.UUID
    company_name: str
    role_id: uuid.UUID
    role_name: str
    role_display_name: str
    role_level: int
    is_primary: bool
    assigned_at: datetime | None


class AdminUserSessionInfo(BaseModel):
    session_id: str
    login_at: datetime | None
    last_seen_at: datetime | None
    ip_address: str | None
    user_agent: str | None


class AdminUserActivityRow(BaseModel):
    at: datetime
    type: str  # "login" | "login_failed"
    ip_address: str | None
    user_agent: str | None


class AdminUserDetail(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    is_active: bool
    is_superuser: bool
    job_title: str | None
    availability_status: str
    company_id: uuid.UUID | None
    company_name: str | None
    department_id: uuid.UUID | None
    department_name: str | None
    created_at: datetime | None
    memberships: list[AdminUserMembership]
    active_sessions: list[AdminUserSessionInfo]
    recent_activity: list[AdminUserActivityRow]


class MembershipCreate(BaseModel):
    company_id: uuid.UUID
    role_id: uuid.UUID
    department_id: uuid.UUID | None = None
    is_primary: bool = False


class MembershipUpdate(BaseModel):
    role_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    clear_department: bool = False
    is_primary: bool | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _company_map(session: AsyncSessionDep) -> dict[uuid.UUID, str]:
    rows = (await session.execute(select(Company.id, Company.name))).all()
    return {row.id: row.name for row in rows}


async def _department_map(session: AsyncSessionDep) -> dict[uuid.UUID, str]:
    rows = (await session.execute(select(Department.id, Department.name))).all()
    return {row.id: row.name for row in rows}


async def _role_map(session: AsyncSessionDep) -> dict[uuid.UUID, Role]:
    rows = (await session.execute(select(Role))).scalars().all()
    return {r.id: r for r in rows}


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("", response_model=list[AdminUserListRow])
async def list_users(session: AsyncSessionDep) -> list[AdminUserListRow]:
    """Rich list of users with company, department, primary role, last login."""
    users = (await session.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    companies = await _company_map(session)
    departments = await _department_map(session)
    roles = await _role_map(session)

    # primary role per user (first row with is_primary, else any)
    ucr_rows = (
        await session.execute(
            select(UserCompanyRole).order_by(UserCompanyRole.is_primary.desc())
        )
    ).scalars().all()
    primary_by_user: dict[uuid.UUID, UserCompanyRole] = {}
    for row in ucr_rows:
        if row.user_id not in primary_by_user:
            primary_by_user[row.user_id] = row

    # last login per user
    last_login_rows = (
        await session.execute(
            select(LoginHistory.user_id, func.max(LoginHistory.login_at))
            .where(LoginHistory.success == True, LoginHistory.user_id.is_not(None))  # noqa: E712
            .group_by(LoginHistory.user_id)
        )
    ).all()
    last_login_by_user: dict[uuid.UUID, datetime] = {
        row[0]: row[1] for row in last_login_rows if row[0] is not None
    }

    result: list[AdminUserListRow] = []
    for u in users:
        ucr = primary_by_user.get(u.id)
        role = roles.get(ucr.role_id) if ucr else None
        result.append(
            AdminUserListRow(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_superuser=u.is_superuser,
                company_id=u.company_id or (ucr.company_id if ucr else None),
                company_name=companies.get(u.company_id) if u.company_id else (
                    companies.get(ucr.company_id) if ucr else None
                ),
                department_id=u.department_id,
                department_name=departments.get(u.department_id) if u.department_id else None,
                primary_role_id=role.id if role else None,
                primary_role_name=role.name if role else None,
                primary_role_display_name=role.display_name if role else None,
                primary_role_level=role.level if role else None,
                last_login_at=last_login_by_user.get(u.id),
                created_at=u.created_at,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
@router.get("/{user_id}/detail", response_model=AdminUserDetail)
async def get_user_detail(user_id: uuid.UUID, session: AsyncSessionDep) -> AdminUserDetail:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    companies = await _company_map(session)
    departments = await _department_map(session)
    roles = await _role_map(session)

    ucr_rows = (
        await session.execute(
            select(UserCompanyRole)
            .where(UserCompanyRole.user_id == user_id)
            .order_by(UserCompanyRole.is_primary.desc(), UserCompanyRole.assigned_at.desc())
        )
    ).scalars().all()

    memberships: list[AdminUserMembership] = []
    for row in ucr_rows:
        role = roles.get(row.role_id)
        if role is None:
            continue
        memberships.append(
            AdminUserMembership(
                company_id=row.company_id,
                company_name=companies.get(row.company_id, ""),
                role_id=role.id,
                role_name=role.name,
                role_display_name=role.display_name,
                role_level=role.level,
                is_primary=row.is_primary,
                assigned_at=row.assigned_at,
            )
        )

    # sessions
    all_sessions = get_session_service().list_active_sessions()
    user_sessions: list[AdminUserSessionInfo] = []
    for s in all_sessions:
        if str(s.get("user_id")) != str(user_id):
            continue
        user_sessions.append(
            AdminUserSessionInfo(
                session_id=s["session_id"],
                login_at=(
                    datetime.fromtimestamp(s["login_at"], tz=timezone.utc)
                    if s.get("login_at")
                    else None
                ),
                last_seen_at=(
                    datetime.fromtimestamp(s["last_seen_at"], tz=timezone.utc)
                    if s.get("last_seen_at")
                    else None
                ),
                ip_address=s.get("ip_address"),
                user_agent=s.get("user_agent"),
            )
        )

    # recent activity (last 30 login attempts)
    activity_rows = (
        await session.execute(
            select(LoginHistory)
            .where(LoginHistory.user_id == user_id)
            .order_by(LoginHistory.login_at.desc())
            .limit(30)
        )
    ).scalars().all()
    activity = [
        AdminUserActivityRow(
            at=r.login_at,
            type="login" if r.success else "login_failed",
            ip_address=r.ip_address,
            user_agent=r.user_agent,
        )
        for r in activity_rows
    ]

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        job_title=user.job_title,
        availability_status=user.availability_status,
        company_id=user.company_id,
        company_name=companies.get(user.company_id) if user.company_id else None,
        department_id=user.department_id,
        department_name=departments.get(user.department_id) if user.department_id else None,
        created_at=user.created_at,
        memberships=memberships,
        active_sessions=user_sessions,
        recent_activity=activity,
    )


# ---------------------------------------------------------------------------
# Memberships (atomic: company + role + department)
# ---------------------------------------------------------------------------
async def _validate_department_company(
    session: AsyncSessionDep,
    department_id: uuid.UUID | None,
    company_id: uuid.UUID,
) -> None:
    if department_id is None:
        return
    dept = await session.get(Department, department_id)
    if dept is None:
        raise HTTPException(status_code=404, detail="Department not found")
    if dept.company_id != company_id:
        raise HTTPException(
            status_code=400,
            detail="Department does not belong to the selected company",
        )


@router.post("/{user_id}/memberships", response_model=AdminUserMembership)
async def add_membership(
    user_id: uuid.UUID,
    body: MembershipCreate,
    session: AsyncSessionDep,
) -> AdminUserMembership:
    """Atomically create a UserCompanyRole + optionally set user.department_id."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    company = await session.get(Company, body.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    role = await session.get(Role, body.role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.company_id != body.company_id:
        raise HTTPException(
            status_code=400,
            detail="Role does not belong to the selected company",
        )
    await _validate_department_company(session, body.department_id, body.company_id)

    existing = (
        await session.execute(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == body.company_id,
                UserCompanyRole.role_id == body.role_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Membership already exists")

    if body.is_primary:
        # demote other primary rows for this user
        others = (
            await session.execute(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == user_id,
                    UserCompanyRole.is_primary == True,  # noqa: E712
                )
            )
        ).scalars().all()
        for o in others:
            o.is_primary = False
            session.add(o)

    ucr = UserCompanyRole(
        user_id=user_id,
        company_id=body.company_id,
        role_id=body.role_id,
        is_primary=body.is_primary,
    )
    session.add(ucr)

    if body.department_id is not None:
        user.department_id = body.department_id
    if body.is_primary or user.company_id is None:
        user.company_id = body.company_id
    session.add(user)

    await session.commit()
    await session.refresh(ucr)

    return AdminUserMembership(
        company_id=body.company_id,
        company_name=company.name,
        role_id=role.id,
        role_name=role.name,
        role_display_name=role.display_name,
        role_level=role.level,
        is_primary=ucr.is_primary,
        assigned_at=ucr.assigned_at,
    )


@router.patch(
    "/{user_id}/memberships/{company_id}",
    response_model=list[AdminUserMembership],
)
async def update_membership(
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    body: MembershipUpdate,
    session: AsyncSessionDep,
) -> list[AdminUserMembership]:
    """Atomically update primary membership for (user, company): role + dept."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    ucr_rows = (
        await session.execute(
            select(UserCompanyRole)
            .where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == company_id,
            )
            .order_by(UserCompanyRole.is_primary.desc())
        )
    ).scalars().all()
    if not ucr_rows:
        raise HTTPException(status_code=404, detail="Membership not found")

    target = ucr_rows[0]

    if body.role_id is not None and body.role_id != target.role_id:
        role = await session.get(Role, body.role_id)
        if role is None:
            raise HTTPException(status_code=404, detail="Role not found")
        if role.company_id != company_id:
            raise HTTPException(
                status_code=400,
                detail="Role does not belong to the selected company",
            )
        # avoid uniq constraint violation by checking duplicates
        dup = next(
            (r for r in ucr_rows if r.id != target.id and r.role_id == body.role_id),
            None,
        )
        if dup is not None:
            raise HTTPException(
                status_code=409, detail="User already has this role in the company"
            )
        target.role_id = body.role_id

    if body.is_primary is True and not target.is_primary:
        for o in (
            await session.execute(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == user_id,
                    UserCompanyRole.is_primary == True,  # noqa: E712
                )
            )
        ).scalars().all():
            o.is_primary = False
            session.add(o)
        target.is_primary = True
        user.company_id = company_id

    if body.clear_department:
        user.department_id = None
    elif body.department_id is not None:
        await _validate_department_company(session, body.department_id, company_id)
        user.department_id = body.department_id

    session.add(target)
    session.add(user)
    await session.commit()

    # return all memberships for the user (caller can refresh easily)
    roles_map = await _role_map(session)
    companies_map = await _company_map(session)
    refreshed = (
        await session.execute(
            select(UserCompanyRole)
            .where(UserCompanyRole.user_id == user_id)
            .order_by(UserCompanyRole.is_primary.desc(), UserCompanyRole.assigned_at.desc())
        )
    ).scalars().all()
    out: list[AdminUserMembership] = []
    for row in refreshed:
        role = roles_map.get(row.role_id)
        if role is None:
            continue
        out.append(
            AdminUserMembership(
                company_id=row.company_id,
                company_name=companies_map.get(row.company_id, ""),
                role_id=role.id,
                role_name=role.name,
                role_display_name=role.display_name,
                role_level=role.level,
                is_primary=row.is_primary,
                assigned_at=row.assigned_at,
            )
        )
    return out


class PermissionItem(BaseModel):
    code: str
    module: str
    action: str
    scope: str
    description: str


class UserPermissionsResponse(BaseModel):
    user_id: uuid.UUID
    is_superuser: bool
    source: str  # "superuser" | "director" | "manager" | "assigned" | "none"
    total: int
    by_module: dict[str, list[PermissionItem]]


@router.get("/{user_id}/permissions", response_model=UserPermissionsResponse)
async def get_user_permissions(
    user_id: uuid.UUID,
    session: AsyncSessionDep,
) -> UserPermissionsResponse:
    """Return effective permissions for a user grouped by module."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    all_perms_rows = (
        await session.execute(select(Permission).order_by(Permission.module, Permission.code))
    ).scalars().all()
    perms_by_code = {p.code: p for p in all_perms_rows}

    if user.is_superuser:
        codes = sorted(perms_by_code.keys())
        source = "superuser"
    else:
        role_ids = await get_user_role_ids(
            session, user.id, company_id=user.company_id
        )
        if not role_ids:
            codes = []
            source = "none"
        else:
            roles = (
                await session.execute(select(Role).where(Role.id.in_(role_ids)))
            ).scalars().all()
            if any(r.level == 1 or r.name in _DIRECTOR_ROLE_NAMES for r in roles):
                codes = sorted(perms_by_code.keys())
                source = "director"
            else:
                assigned = (
                    await session.execute(
                        select(Permission.code)
                        .select_from(RolePermission)
                        .join(Permission, Permission.id == RolePermission.permission_id)
                        .where(RolePermission.role_id.in_(role_ids))
                    )
                ).scalars().all()
                assigned_set = set(assigned)
                if any(r.level <= 2 for r in roles):
                    assigned_set |= set(MANAGER_AUTO_PERMISSION_CODES)
                    source = "manager"
                else:
                    source = "assigned"
                codes = sorted(assigned_set)

    by_module: dict[str, list[PermissionItem]] = {}
    for c in codes:
        p = perms_by_code.get(c)
        if p is None:
            continue
        by_module.setdefault(p.module, []).append(
            PermissionItem(
                code=p.code,
                module=p.module,
                action=p.action,
                scope=p.scope,
                description=p.description,
            )
        )

    return UserPermissionsResponse(
        user_id=user.id,
        is_superuser=user.is_superuser,
        source=source,
        total=len(codes),
        by_module=by_module,
    )


@router.delete("/{user_id}/memberships/{company_id}", status_code=204)
async def delete_membership(
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    session: AsyncSessionDep,
) -> None:
    """Remove ALL memberships for (user, company) and clear department if it belongs to company."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    rows = (
        await session.execute(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == user_id,
                UserCompanyRole.company_id == company_id,
            )
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Membership not found")
    for r in rows:
        await session.delete(r)

    if user.company_id == company_id:
        user.company_id = None
    if user.department_id is not None:
        dept = await session.get(Department, user.department_id)
        if dept is not None and dept.company_id == company_id:
            user.department_id = None
    session.add(user)
    await session.commit()
    return None
