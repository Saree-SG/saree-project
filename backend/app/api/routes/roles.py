"""Role, RBAC, company and org-tree routes — full async."""

from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.org import (
    AccountMembershipPublic,
    AccountProfilePublic,
    Company,
    CompanyCreate,
    CompanyMemberPublic,
    CompanyMemberRoleUpdateRequest,
    CompanyPublic,
    CompanyUpdate,
    Department,
    DepartmentCreate,
    DepartmentPublic,
    DepartmentUpdate,
    UserDepartmentAssign,
    OrgTreeDepartmentGroupPublic,
    OrgTreeMemberPublic,
    OrgTreePublic,
    OrgTreeRoleNodePublic,
    Permission,
    PermissionPublic,
    Role,
    RoleCreate,
    RoleDependency,
    RoleDependencyCreate,
    RoleDependencyPublic,
    RolePermission,
    RolePermissionAssignRequest,
    RolePermissionAssignResponse,
    UserCompanyRole,
    UserCompanyRoleCreate,
    UserCompanyRolePublic,
)
from app.models.user import User
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.shared.permission import (
    MANAGER_AUTO_PERMISSION_CODES,
    get_user_role_ids,
    has_permission,
    require_permission,
)

router = APIRouter(prefix="/roles", tags=["roles"])
DIRECTOR_ROLE_NAMES = {"director", "giam_doc"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_same_company(company_id: uuid.UUID, role: Role) -> None:
    """Validate role belongs to requested company."""
    if role.company_id != company_id:
        raise HTTPException(422, "Role does not belong to company")


async def _has_director_role(
    repo: RoleRepository, user_id: uuid.UUID, company_id: uuid.UUID
) -> bool:
    """Return True when user has company-director scope role in company."""
    assignments = await repo.get_user_company_roles(user_id, company_id)
    for assignment in assignments:
        role = await repo.get_by_id(assignment.role_id)
        if role and (role.level == 1 or role.name in DIRECTOR_ROLE_NAMES):
            return True
    return False


async def _ensure_company_manage_permission(
    repo: RoleRepository, current_user: User, company_id: uuid.UUID
) -> None:
    """Allow action only for superuser or director in target company."""
    if current_user.is_superuser:
        return
    if await _has_director_role(repo, current_user.id, company_id):
        return
    raise HTTPException(403, "Only superuser or company director can perform this action")


async def _can_assign_role(
    session: AsyncSession,
    repo: RoleRepository,
    current_user: User,
    company_id: uuid.UUID,
    target_role: Role,
) -> bool:
    """Evaluate whether actor can assign target role in company."""
    if current_user.is_superuser:
        return True
    if target_role.name == "admin":
        return False
    if await has_permission(session, current_user, "COMPANY_CREATE"):
        return True
    if await _has_director_role(repo, current_user.id, company_id):
        actor_roles = await repo.get_user_company_roles(current_user.id, company_id)
        actor_levels: list[int] = []
        for ar in actor_roles:
            role = await repo.get_by_id(ar.role_id)
            if role is not None:
                actor_levels.append(role.level)
        if not actor_levels:
            return False
        actor_top_level = min(actor_levels)
        if target_role.name == "director":
            return False
        return target_role.level > actor_top_level
    return False


async def _sync_user_company_id(
    session: AsyncSession, _repo: RoleRepository, user: User
) -> None:
    """Synchronize user.company_id from primary company role assignments."""
    all_rows_result = await session.execute(
        select(UserCompanyRole).where(UserCompanyRole.user_id == user.id)
    )
    all_rows = all_rows_result.scalars().all()
    primary = next((r for r in all_rows if r.is_primary), None)
    if primary is not None:
        user.company_id = primary.company_id
    elif all_rows:
        user.company_id = all_rows[0].company_id
    else:
        user.company_id = None
    session.add(user)


# ---------------------------------------------------------------------------
# Role dependencies
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[RoleDependencyPublic])
async def list_role_dependencies(
    session: AsyncSessionDep,
    _current_user: CurrentUser,
    company_id: uuid.UUID = Query(...),
    relation_type: str | None = Query(default=None),
) -> list[RoleDependencyPublic]:
    """List role dependencies for a company."""
    repo = RoleRepository(session)
    rows = await repo.list_role_dependencies(company_id, relation_type)
    result: list[RoleDependencyPublic] = []
    for row in rows:
        from_role = await repo.get_by_id(row.from_role_id)
        to_role = await repo.get_by_id(row.to_role_id)
        if from_role is None or to_role is None:
            continue
        result.append(
            RoleDependencyPublic(
                id=row.id,
                company_id=row.company_id,
                from_role_id=row.from_role_id,
                from_role_name=from_role.display_name,
                to_role_id=row.to_role_id,
                to_role_name=to_role.display_name,
                relation_type=row.relation_type,
                is_active=row.is_active,
                created_at=row.created_at,
            )
        )
    return result


@router.get("/catalog", response_model=list[Role])
async def list_company_roles(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID = Query(...),
) -> list[Role]:
    """List roles in a company for UI dropdowns."""
    repo = RoleRepository(session)
    return list(await repo.list_company_roles(company_id, exclude_admin=not current_user.is_superuser))


@router.get("/my-permissions", response_model=list[str])
async def my_permissions(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[str]:
    """Return effective permission codes of current user in current context."""
    role_ids = await get_user_role_ids(
        session,
        current_user.id,
        company_id=current_user.company_id,
    )
    if not role_ids:
        return []

    # Business rule: company director scope has full company permissions.
    role_result = await session.execute(
        select(Role).where(Role.id.in_(role_ids))  # type: ignore[arg-type]
    )
    roles = role_result.scalars().all()
    if any(role.level == 1 or role.name in DIRECTOR_ROLE_NAMES for role in roles):
        all_perms = await session.execute(select(Permission.code).order_by(Permission.code))
        return list(all_perms.scalars().all())
    if any(role.level <= 2 for role in roles):
        managed_codes = sorted(set(MANAGER_AUTO_PERMISSION_CODES))
        assigned_result = await session.execute(
            select(Permission.code)
            .select_from(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role_id.in_(role_ids))  # type: ignore[arg-type]
        )
        assigned_codes = set(assigned_result.scalars().all())
        return sorted(assigned_codes.union(set(managed_codes)))

    result = await session.execute(
        select(Permission.code)
        .select_from(RolePermission)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role_id.in_(role_ids))  # type: ignore[arg-type]
    )
    codes = sorted(set(result.scalars().all()))
    return list(codes)


@router.get("/permissions-catalog", response_model=list[PermissionPublic])
async def permissions_catalog(
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[PermissionPublic]:
    """Return all available permissions for RBAC UI configuration."""
    result = await session.execute(select(Permission).order_by(Permission.module, Permission.code))
    return [PermissionPublic(**row.model_dump()) for row in result.scalars().all()]


@router.get("/{role_id}/permissions", response_model=list[str])
async def role_permissions(
    role_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[str]:
    """Return permission codes currently assigned to a role."""
    repo = RoleRepository(session)
    role = await repo.get_role_or_404(role_id)
    await _ensure_company_manage_permission(repo, current_user, role.company_id)
    result = await session.execute(
        select(Permission.code)
        .select_from(RolePermission)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role_id == role.id)
        .order_by(Permission.code)
    )
    return list(result.scalars().all())


@router.post("/{role_id}/permissions", response_model=RolePermissionAssignResponse)
async def assign_role_permissions(
    role_id: uuid.UUID,
    body: RolePermissionAssignRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> RolePermissionAssignResponse:
    """Replace role permissions by permission codes for a target role."""
    repo = RoleRepository(session)
    role = await repo.get_role_or_404(role_id)
    await _ensure_company_manage_permission(repo, current_user, role.company_id)

    requested_codes = sorted(set(body.permission_codes))
    if not requested_codes:
        existing_result = await session.execute(
            select(RolePermission).where(RolePermission.role_id == role.id)
        )
        for row in existing_result.scalars().all():
            await session.delete(row)
        return RolePermissionAssignResponse(role_id=role.id, assigned_permission_codes=[])

    perms_result = await session.execute(
        select(Permission).where(Permission.code.in_(requested_codes))  # type: ignore[arg-type]
    )
    perms = perms_result.scalars().all()
    found_codes = {perm.code for perm in perms}
    missing_codes = [code for code in requested_codes if code not in found_codes]
    if missing_codes:
        raise HTTPException(422, f"Unknown permission code(s): {', '.join(missing_codes)}")

    existing_result = await session.execute(
        select(RolePermission).where(RolePermission.role_id == role.id)
    )
    for row in existing_result.scalars().all():
        await session.delete(row)

    for perm in perms:
        session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    return RolePermissionAssignResponse(
        role_id=role.id,
        assigned_permission_codes=requested_codes,
    )


# ---------------------------------------------------------------------------
# Company CRUD
# ---------------------------------------------------------------------------

@router.post("/companies", response_model=CompanyPublic, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> CompanyPublic:
    """Create company (superuser or COMPANY_CREATE permission)."""
    if not current_user.is_superuser and not await has_permission(session, current_user, "COMPANY_CREATE"):
        raise HTTPException(403, "Permission 'COMPANY_CREATE' required")
    repo = RoleRepository(session)
    existing = await repo.get_company_by_slug(body.slug)
    if existing is not None:
        raise HTTPException(409, "Company slug already exists")
    company = await repo.create_company({"name": body.name, "slug": body.slug})
    return CompanyPublic(id=company.id, name=company.name, slug=company.slug, is_active=company.is_active)


@router.get("/companies", response_model=list[CompanyPublic])
async def list_companies(
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[CompanyPublic]:
    """List all companies."""
    repo = RoleRepository(session)
    companies = await repo.list_companies()
    return [
        CompanyPublic(id=c.id, name=c.name, slug=c.slug, is_active=c.is_active)
        for c in companies
    ]


@router.get("/my-companies", response_model=list[CompanyPublic])
async def list_my_companies(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[CompanyPublic]:
    """List companies the current user belongs to (via UserCompanyRole)."""
    result = await session.execute(
        select(UserCompanyRole.company_id)
        .where(UserCompanyRole.user_id == current_user.id)
        .distinct()
    )
    company_ids = result.scalars().all()
    companies = []
    for cid in company_ids:
        c = await session.get(Company, cid)
        if c and c.is_active:
            companies.append(CompanyPublic(id=c.id, name=c.name, slug=c.slug, is_active=c.is_active))
    return companies


@router.get("/companies/{company_id}/members", response_model=list[CompanyMemberPublic])
async def list_company_members(
    company_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[CompanyMemberPublic]:
    """List members of a company with their assigned company roles."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)

    result = await session.execute(
        select(UserCompanyRole)
        .where(UserCompanyRole.company_id == company_id)
        .order_by(UserCompanyRole.is_primary.desc(), UserCompanyRole.assigned_at.desc())
    )
    rows = result.scalars().all()

    members: list[CompanyMemberPublic] = []
    for row in rows:
        user = await session.get(User, row.user_id)
        role = await repo.get_by_id(row.role_id)
        if user is None or role is None:
            continue
        members.append(
            CompanyMemberPublic(
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                role_id=role.id,
                role_name=role.name,
                role_display_name=role.display_name,
                role_level=role.level,
                is_primary=row.is_primary,
                department_id=user.department_id,
            )
        )
    return members


@router.patch("/companies/{company_id}", response_model=CompanyPublic)
async def update_company(
    company_id: uuid.UUID,
    body: CompanyUpdate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> CompanyPublic:
    """Edit company name/active status."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    company = await repo.get_company_or_404(company_id)
    data: dict = {}
    if body.name is not None:
        data["name"] = body.name
    if body.is_active is not None:
        data["is_active"] = body.is_active
    company = await repo.update_company(company, data)
    return CompanyPublic(id=company.id, name=company.name, slug=company.slug, is_active=company.is_active)


# ---------------------------------------------------------------------------
# Department CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/companies/{company_id}/departments",
    response_model=DepartmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_department(
    company_id: uuid.UUID,
    body: DepartmentCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> DepartmentPublic:
    """Create department in a company."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    await repo.get_company_or_404(company_id)
    dept = await repo.create_department({
        "company_id": company_id,
        "parent_id": body.parent_id,
        "name": body.name,
        "dept_type": body.dept_type,
        "is_active": True,
    })
    return DepartmentPublic(
        id=dept.id,
        company_id=dept.company_id,
        parent_id=dept.parent_id,
        name=dept.name,
        dept_type=dept.dept_type,
        is_active=dept.is_active,
    )


@router.get("/companies/{company_id}/departments", response_model=list[DepartmentPublic])
async def list_departments(
    company_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[DepartmentPublic]:
    """List departments for a company."""
    repo = RoleRepository(session)
    rows = await repo.list_departments(company_id)
    return [
        DepartmentPublic(
            id=r.id,
            company_id=r.company_id,
            parent_id=r.parent_id,
            name=r.name,
            dept_type=r.dept_type,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.patch(
    "/companies/{company_id}/departments/{department_id}",
    response_model=DepartmentPublic,
)
async def update_department(
    company_id: uuid.UUID,
    department_id: uuid.UUID,
    body: DepartmentUpdate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> DepartmentPublic:
    """Update department name, type, active status, or parent."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    dept = await repo.get_department_or_404(department_id)
    if dept.company_id != company_id:
        raise HTTPException(422, "Department does not belong to company")
    data = body.model_dump(exclude_unset=True)
    dept = await repo.update_department(dept, data)
    return DepartmentPublic(
        id=dept.id,
        company_id=dept.company_id,
        parent_id=dept.parent_id,
        name=dept.name,
        dept_type=dept.dept_type,
        is_active=dept.is_active,
    )


@router.delete(
    "/companies/{company_id}/departments/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_department(
    company_id: uuid.UUID,
    department_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Hard-delete a department. Fails if users are still assigned."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    dept = await repo.get_department_or_404(department_id)
    if dept.company_id != company_id:
        raise HTTPException(422, "Department does not belong to company")
    result = await session.execute(
        select(User).where(User.department_id == department_id).limit(1)
    )
    if result.scalars().first():
        raise HTTPException(
            409,
            "Không thể xóa phòng ban vì vẫn còn nhân viên. Vui lòng chuyển nhân viên trước.",
        )
    await repo.delete_department(dept)


@router.post(
    "/companies/{company_id}/departments/{department_id}/assign-user",
    response_model=DepartmentPublic,
)
async def assign_user_to_department(
    company_id: uuid.UUID,
    department_id: uuid.UUID,
    body: UserDepartmentAssign,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> DepartmentPublic:
    """Assign a user to this department."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    dept = await repo.get_department_or_404(department_id)
    if dept.company_id != company_id:
        raise HTTPException(422, "Department does not belong to company")
    user = await session.get(User, body.user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    user.department_id = department_id
    session.add(user)
    await session.flush()
    return DepartmentPublic(
        id=dept.id,
        company_id=dept.company_id,
        parent_id=dept.parent_id,
        name=dept.name,
        dept_type=dept.dept_type,
        is_active=dept.is_active,
    )


@router.delete(
    "/companies/{company_id}/members/{user_id}/department",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_user_from_department(
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Remove department assignment from a user."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    user.department_id = None
    session.add(user)
    await session.flush()


# ---------------------------------------------------------------------------
# Role CRUD
# ---------------------------------------------------------------------------

@router.post("/create", response_model=Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID = Query(...),
    body: RoleCreate = ...,
) -> Role:
    """Create role inside company scope."""
    repo = RoleRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    normalized_name = body.name.strip().lower().replace(" ", "_")
    if normalized_name == "admin" and not current_user.is_superuser:
        raise HTTPException(403, "Director cannot create admin role")
    if not 1 <= body.level <= 5:
        raise HTTPException(422, "Role level must be between 1 and 5")
    existing = await repo.get_role_by_name(company_id, normalized_name)
    if existing:
        raise HTTPException(409, "Role name already exists in this company")
    role = await repo.create_role({
        "company_id": company_id,
        "name": normalized_name,
        "display_name": body.display_name,
        "level": body.level,
        "description": body.description,
        "policy_doc": body.policy_doc,
        "is_system": False,
    })
    return role


# ---------------------------------------------------------------------------
# Role dependencies
# ---------------------------------------------------------------------------

@router.post("/dependencies", response_model=RoleDependencyPublic, status_code=status.HTTP_201_CREATED)
async def create_role_dependency(
    body: RoleDependencyCreate,
    session: AsyncSessionDep,
    _current_user: User = Depends(require_permission("USER_MANAGE")),
) -> RoleDependencyPublic:
    """Create role dependency with level and cycle validations."""
    repo = RoleRepository(session)
    from_role = await repo.get_role_or_404(body.from_role_id)
    to_role = await repo.get_role_or_404(body.to_role_id)
    _ensure_same_company(body.company_id, from_role)
    _ensure_same_company(body.company_id, to_role)
    if body.from_role_id == body.to_role_id:
        raise HTTPException(422, "Role cannot depend on itself")

    if body.relation_type == "REPORTS_TO":
        if from_role.level <= to_role.level:
            raise HTTPException(422, "REPORTS_TO requires from_role lower hierarchy than to_role")
        await repo.check_reports_to_cycle(body.company_id, body.from_role_id, body.to_role_id)
    if body.relation_type == "PEERS_WITH" and from_role.level != to_role.level:
        raise HTTPException(422, "PEERS_WITH requires equal role levels")
    if body.relation_type == "REQUIRES_APPROVAL_FROM" and to_role.level > from_role.level:
        raise HTTPException(422, "REQUIRES_APPROVAL_FROM must target equal or higher role")

    existing_result = await session.execute(
        select(RoleDependency).where(
            RoleDependency.company_id == body.company_id,
            RoleDependency.from_role_id == body.from_role_id,
            RoleDependency.to_role_id == body.to_role_id,
            RoleDependency.relation_type == body.relation_type,
        )
    )
    if existing_result.scalars().first():
        raise HTTPException(409, "Dependency already exists")

    row = await repo.create_role_dependency({**body.model_dump(), "is_active": True})

    if body.relation_type == "PEERS_WITH":
        recip_result = await session.execute(
            select(RoleDependency).where(
                RoleDependency.company_id == body.company_id,
                RoleDependency.from_role_id == body.to_role_id,
                RoleDependency.to_role_id == body.from_role_id,
                RoleDependency.relation_type == "PEERS_WITH",
            )
        )
        if recip_result.scalars().first() is None:
            await repo.create_role_dependency({
                "company_id": body.company_id,
                "from_role_id": body.to_role_id,
                "to_role_id": body.from_role_id,
                "relation_type": "PEERS_WITH",
                "is_active": True,
            })

    return RoleDependencyPublic(
        id=row.id,
        company_id=row.company_id,
        from_role_id=row.from_role_id,
        from_role_name=from_role.display_name,
        to_role_id=row.to_role_id,
        to_role_name=to_role.display_name,
        relation_type=row.relation_type,
        is_active=row.is_active,
        created_at=row.created_at,
    )


# ---------------------------------------------------------------------------
# User company role assignments
# ---------------------------------------------------------------------------

@router.post("/assignments", response_model=UserCompanyRolePublic, status_code=status.HTTP_201_CREATED)
async def assign_user_company_role(
    body: UserCompanyRoleCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> UserCompanyRolePublic:
    """Assign role to user in a company."""
    repo = RoleRepository(session)
    user_repo = UserRepository(session)
    user = await user_repo.get_or_404(body.user_id)
    company = await repo.get_company_or_404(body.company_id)
    role = await repo.get_role_or_404(body.role_id)
    if not await _can_assign_role(session, repo, current_user, body.company_id, role):
        raise HTTPException(403, "You are not allowed to assign this role")
    _ensure_same_company(body.company_id, role)

    assignment = await repo.assign_company_role(
        body.user_id, body.company_id, body.role_id, body.is_primary
    )
    if body.is_primary:
        all_rows_result = await session.execute(
            select(UserCompanyRole).where(UserCompanyRole.user_id == body.user_id)
        )
        for row in all_rows_result.scalars().all():
            row.is_primary = (row.id == assignment.id)
            session.add(row)
    await _sync_user_company_id(session, repo, user)

    return UserCompanyRolePublic(
        id=assignment.id,
        user_id=assignment.user_id,
        company_id=assignment.company_id,
        role_id=assignment.role_id,
        role_name=role.name,
        role_display_name=role.display_name,
        company_name=company.name,
        is_primary=assignment.is_primary,
        assigned_at=assignment.assigned_at,
    )


@router.patch("/companies/{company_id}/members/{user_id}", response_model=UserCompanyRolePublic)
async def update_company_member_role(
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    body: CompanyMemberRoleUpdateRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> UserCompanyRolePublic:
    """Update role assignment of a member inside a company."""
    repo = RoleRepository(session)
    user_repo = UserRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)

    user = await user_repo.get_or_404(user_id)
    current_role = await repo.get_role_or_404(body.current_role_id)
    new_role = await repo.get_role_or_404(body.new_role_id)
    _ensure_same_company(company_id, current_role)
    _ensure_same_company(company_id, new_role)
    if not await _can_assign_role(session, repo, current_user, company_id, new_role):
        raise HTTPException(403, "You are not allowed to assign this role")

    current_row_result = await session.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == body.current_role_id,
        )
    )
    current_row = current_row_result.scalars().first()
    if current_row is None:
        raise HTTPException(404, "Current member role assignment not found")

    if body.current_role_id == body.new_role_id:
        current_row.is_primary = body.is_primary
        session.add(current_row)
        assignment = current_row
    else:
        await session.delete(current_row)
        assignment = await repo.assign_company_role(
            user_id=user_id,
            company_id=company_id,
            role_id=body.new_role_id,
            is_primary=body.is_primary,
        )

    if body.is_primary:
        rows_result = await session.execute(
            select(UserCompanyRole).where(UserCompanyRole.user_id == user_id)
        )
        for row in rows_result.scalars().all():
            row.is_primary = (row.id == assignment.id)
            session.add(row)

    await _sync_user_company_id(session, repo, user)
    company = await repo.get_company_or_404(company_id)
    role = await repo.get_role_or_404(assignment.role_id)
    return UserCompanyRolePublic(
        id=assignment.id,
        user_id=assignment.user_id,
        company_id=assignment.company_id,
        role_id=assignment.role_id,
        role_name=role.name,
        role_display_name=role.display_name,
        company_name=company.name,
        is_primary=assignment.is_primary,
        assigned_at=assignment.assigned_at,
    )


@router.delete("/companies/{company_id}/members/{user_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_company_member_role(
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    """Remove a role assignment of a member inside a company."""
    repo = RoleRepository(session)
    user_repo = UserRepository(session)
    await _ensure_company_manage_permission(repo, current_user, company_id)
    user = await user_repo.get_or_404(user_id)

    row_result = await session.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
    )
    row = row_result.scalars().first()
    if row is None:
        raise HTTPException(404, "Member role assignment not found")

    await session.delete(row)
    await _sync_user_company_id(session, repo, user)


@router.get("/assignments/{user_id}", response_model=list[UserCompanyRolePublic])
async def list_user_company_roles(
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[UserCompanyRolePublic]:
    """List role assignments of a user across companies."""
    result = await session.execute(
        select(UserCompanyRole).where(UserCompanyRole.user_id == user_id)
    )
    rows = result.scalars().all()
    repo = RoleRepository(session)
    out: list[UserCompanyRolePublic] = []
    for row in rows:
        company = await repo.get_company(row.company_id)
        role = await repo.get_by_id(row.role_id)
        if company is None or role is None:
            continue
        out.append(
            UserCompanyRolePublic(
                id=row.id,
                user_id=row.user_id,
                company_id=row.company_id,
                role_id=row.role_id,
                role_name=role.name,
                role_display_name=role.display_name,
                company_name=company.name,
                is_primary=row.is_primary,
                assigned_at=row.assigned_at,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Me profile
# ---------------------------------------------------------------------------

@router.get("/me/profile", response_model=AccountProfilePublic)
async def my_account_profile(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> AccountProfilePublic:
    """Return account profile with company-role memberships."""
    result = await session.execute(
        select(UserCompanyRole).where(UserCompanyRole.user_id == current_user.id)
    )
    rows = result.scalars().all()
    repo = RoleRepository(session)
    memberships: list[AccountMembershipPublic] = []
    for row in rows:
        company = await repo.get_company(row.company_id)
        role = await repo.get_by_id(row.role_id)
        if company is None or role is None:
            continue
        memberships.append(
            AccountMembershipPublic(
                company_id=company.id,
                company_name=company.name,
                role_id=role.id,
                role_name=role.name,
                role_display_name=role.display_name,
                role_level=role.level,
                is_primary=row.is_primary,
            )
        )
    return AccountProfilePublic(
        user_id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        memberships=memberships,
    )


# ---------------------------------------------------------------------------
# Org tree
# ---------------------------------------------------------------------------

@router.get("/org-tree", response_model=OrgTreePublic)
async def get_org_tree(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    company_id: uuid.UUID = Query(...),
    department_id: uuid.UUID | None = Query(default=None),
) -> OrgTreePublic:
    """Return organization tree grouped by department, sorted by role level."""
    repo = RoleRepository(session)
    company = await repo.get_company_or_404(company_id)

    assignments_result = await session.execute(
        select(UserCompanyRole).where(UserCompanyRole.company_id == company_id)
    )
    assignments = assignments_result.scalars().all()

    current_user_assignments = [a for a in assignments if a.user_id == current_user.id]
    if not current_user.is_superuser and not current_user_assignments:
        raise HTTPException(403, "You are not a member of this company")

    role_ids = {a.role_id for a in assignments}
    user_ids = {a.user_id for a in assignments}

    roles_result = await session.execute(
        select(Role).where(Role.id.in_(list(role_ids)))  # type: ignore[arg-type]
    ) if role_ids else None
    roles = roles_result.scalars().all() if roles_result else []
    role_by_id = {r.id: r for r in roles}

    users_result = await session.execute(
        select(User).where(User.id.in_(list(user_ids)))  # type: ignore[arg-type]
    ) if user_ids else None
    users = users_result.scalars().all() if users_result else []
    user_by_id = {u.id: u for u in users}

    dept_ids = {u.department_id for u in users if u.department_id is not None}
    dept_result = await session.execute(
        select(Department).where(Department.id.in_(list(dept_ids)))  # type: ignore[arg-type]
    ) if dept_ids else None
    departments = dept_result.scalars().all() if dept_result else []
    dept_name_by_id = {d.id: d.name for d in departments}

    current_primary = next((a for a in current_user_assignments if a.is_primary), None)
    if current_primary is None and current_user_assignments:
        current_primary = current_user_assignments[0]
    current_role = role_by_id.get(current_primary.role_id) if current_primary else None
    current_role_level = current_role.level if current_role else None

    rows_by_dept: dict[uuid.UUID | None, list[UserCompanyRole]] = defaultdict(list)
    for assignment in assignments:
        user = user_by_id.get(assignment.user_id)
        if user is None:
            continue
        if department_id is not None and user.department_id != department_id:
            continue
        rows_by_dept[user.department_id].append(assignment)

    department_groups: list[OrgTreeDepartmentGroupPublic] = []
    for dept_id, dept_rows in rows_by_dept.items():
        role_to_members: dict[uuid.UUID, list[OrgTreeMemberPublic]] = defaultdict(list)
        for assignment in dept_rows:
            role = role_by_id.get(assignment.role_id)
            user = user_by_id.get(assignment.user_id)
            if role is None or user is None:
                continue
            role_to_members[role.id].append(
                OrgTreeMemberPublic(
                    user_id=user.id,
                    full_name=user.full_name,
                    email=user.email,
                    department_id=user.department_id,
                    department_name=dept_name_by_id.get(user.department_id),
                    is_current_user=(user.id == current_user.id),
                )
            )

        role_nodes: list[OrgTreeRoleNodePublic] = []
        for role_id, members in role_to_members.items():
            role = role_by_id.get(role_id)
            if role is None:
                continue
            relation = "peer"
            if current_role_level is not None:
                if role.level < current_role_level:
                    relation = "below"
                elif role.level > current_role_level:
                    relation = "above"
            role_nodes.append(
                OrgTreeRoleNodePublic(
                    role_id=role.id,
                    role_name=role.name,
                    role_display_name=role.display_name,
                    role_level=role.level,
                    relation_to_current=relation,
                    members=sorted(members, key=lambda m: (m.full_name or m.email or "").lower()),
                )
            )
        role_nodes.sort(key=lambda n: n.role_level)

        department_groups.append(
            OrgTreeDepartmentGroupPublic(
                department_id=dept_id,
                department_name=dept_name_by_id.get(dept_id, "No Department"),
                roles=role_nodes,
            )
        )

    department_groups.sort(key=lambda g: g.department_name.lower())

    return OrgTreePublic(
        company_id=company.id,
        company_name=company.name,
        current_user_id=current_user.id,
        current_role_id=current_role.id if current_role else None,
        current_role_level=current_role_level,
        departments=department_groups,
    )
