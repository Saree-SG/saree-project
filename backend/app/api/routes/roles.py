"""Role, role dependency, and user-company-role APIs."""

from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_db
from app.models.org import (
    AccountMembershipPublic,
    AccountProfilePublic,
    Company,
    CompanyCreate,
    CompanyPublic,
    CompanyUpdate,
    Department,
    DepartmentCreate,
    DepartmentPublic,
    OrgTreeDepartmentGroupPublic,
    OrgTreeMemberPublic,
    OrgTreePublic,
    OrgTreeRoleNodePublic,
    Role,
    RoleCreate,
    RoleDependency,
    RoleDependencyCreate,
    RoleDependencyPublic,
    UserCompanyRole,
    UserCompanyRoleCreate,
    UserCompanyRolePublic,
)
from app.models.user import User
from app.shared.permission import has_permission, require_permission

router = APIRouter(prefix="/roles", tags=["roles"])


def _ensure_same_company(company_id: uuid.UUID, role: Role) -> None:
    """Validate role belongs to requested company."""

    if role.company_id != company_id:
        raise HTTPException(422, "Role does not belong to company")


def _reports_to_cycle_check(
    session: Session,
    company_id: uuid.UUID,
    from_role_id: uuid.UUID,
    to_role_id: uuid.UUID,
) -> None:
    """Prevent circular REPORTS_TO dependencies."""

    rows = session.exec(
        select(RoleDependency).where(
            RoleDependency.company_id == company_id,
            RoleDependency.relation_type == "REPORTS_TO",
            RoleDependency.is_active == True,  # noqa: E712
        )
    ).all()
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


def _has_director_role_in_company(session: Session, user_id: uuid.UUID, company_id: uuid.UUID) -> bool:
    """Return True when user has director role in selected company."""

    assignments = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    ).all()
    for assignment in assignments:
        role = session.get(Role, assignment.role_id)
        if role and role.name == "director":
            return True
    return False


def _ensure_company_manage_permission(session: Session, current_user: User, company_id: uuid.UUID) -> None:
    """Allow action only for superuser or director in target company."""

    if current_user.is_superuser:
        return
    if _has_director_role_in_company(session, current_user.id, company_id):
        return
    raise HTTPException(status_code=403, detail="Only superuser or company director can perform this action")


def _can_assign_role(
    session: Session,
    current_user: User,
    company_id: uuid.UUID,
    target_role: Role,
) -> bool:
    """Evaluate whether actor can assign target role in selected company."""

    if current_user.is_superuser:
        return True
    if target_role.name == "admin":
        return False

    if has_permission(session, current_user, "COMPANY_CREATE"):
        return True

    if _has_director_role_in_company(session, current_user.id, company_id):
        actor_roles = session.exec(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == current_user.id,
                UserCompanyRole.company_id == company_id,
            )
        ).all()
        actor_levels: list[int] = []
        for actor_role_map in actor_roles:
            actor_role = session.get(Role, actor_role_map.role_id)
            if actor_role is not None:
                actor_levels.append(actor_role.level)
        if not actor_levels:
            return False
        actor_top_level = min(actor_levels)
        if target_role.name == "director":
            return False
        return target_role.level > actor_top_level

    return False


def _sync_user_company_id_from_memberships(session: Session, user: User) -> None:
    """Synchronize user.company_id from primary company role assignments."""

    rows = session.exec(
        select(UserCompanyRole).where(UserCompanyRole.user_id == user.id)
    ).all()
    primary = next((row for row in rows if row.is_primary), None)
    if primary is not None:
        user.company_id = primary.company_id
    elif rows:
        user.company_id = rows[0].company_id
    else:
        user.company_id = None
    session.add(user)


@router.get("/", response_model=list[RoleDependencyPublic])
def list_role_dependencies(
    company_id: uuid.UUID = Query(...),
    relation_type: str | None = Query(default=None),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List role dependencies for a company."""

    query = select(RoleDependency).where(RoleDependency.company_id == company_id)
    if relation_type:
        query = query.where(RoleDependency.relation_type == relation_type)
    rows = session.exec(query).all()
    result: list[RoleDependencyPublic] = []
    for row in rows:
        from_role = session.get(Role, row.from_role_id)
        to_role = session.get(Role, row.to_role_id)
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
def list_company_roles(
    company_id: uuid.UUID = Query(...),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List roles in a company for UI dropdowns."""

    query = select(Role).where(Role.company_id == company_id)
    if not current_user.is_superuser:
        query = query.where(Role.name != "admin")
    rows = session.exec(query).all()
    return rows


@router.post("/companies", response_model=CompanyPublic, status_code=status.HTTP_201_CREATED)
def create_company(
    body: CompanyCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create company. Allowed for superuser or users with COMPANY_CREATE permission."""

    if not current_user.is_superuser and not has_permission(session, current_user, "COMPANY_CREATE"):
        raise HTTPException(status_code=403, detail="Permission 'COMPANY_CREATE' required")
    existing = session.exec(select(Company).where(Company.slug == body.slug)).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Company slug already exists")
    company = Company(name=body.name, slug=body.slug)
    session.add(company)
    session.commit()
    session.refresh(company)
    return CompanyPublic(id=company.id, name=company.name, slug=company.slug, is_active=company.is_active)


@router.get("/companies", response_model=list[CompanyPublic])
def list_companies(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List companies for admin UI."""

    companies = session.exec(select(Company).order_by(Company.created_at.desc())).all()
    return [
        CompanyPublic(id=company.id, name=company.name, slug=company.slug, is_active=company.is_active)
        for company in companies
    ]


@router.patch("/companies/{company_id}", response_model=CompanyPublic)
def update_company(
    company_id: uuid.UUID,
    body: CompanyUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit company name/active status for admin or director of that company."""

    _ensure_company_manage_permission(session, current_user, company_id)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    if body.name is not None:
        company.name = body.name
    if body.is_active is not None:
        company.is_active = body.is_active
    session.add(company)
    session.commit()
    session.refresh(company)
    return CompanyPublic(id=company.id, name=company.name, slug=company.slug, is_active=company.is_active)


@router.post(
    "/companies/{company_id}/departments",
    response_model=DepartmentPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    company_id: uuid.UUID,
    body: DepartmentCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create department in a company. Allowed for superuser or company director."""

    _ensure_company_manage_permission(session, current_user, company_id)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    department = Department(
        company_id=company_id,
        parent_id=body.parent_id,
        name=body.name,
        dept_type=body.dept_type,
        is_active=True,
    )
    session.add(department)
    session.commit()
    session.refresh(department)
    return DepartmentPublic(
        id=department.id,
        company_id=department.company_id,
        parent_id=department.parent_id,
        name=department.name,
        dept_type=department.dept_type,
        is_active=department.is_active,
    )


@router.get("/companies/{company_id}/departments", response_model=list[DepartmentPublic])
def list_departments(
    company_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List departments for selected company."""

    rows = session.exec(select(Department).where(Department.company_id == company_id)).all()
    return [
        DepartmentPublic(
            id=row.id,
            company_id=row.company_id,
            parent_id=row.parent_id,
            name=row.name,
            dept_type=row.dept_type,
            is_active=row.is_active,
        )
        for row in rows
    ]


@router.post("/create", response_model=Role, status_code=status.HTTP_201_CREATED)
def create_role(
    company_id: uuid.UUID,
    body: RoleCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create role inside company scope."""

    _ensure_company_manage_permission(session, current_user, company_id)
    normalized_name = body.name.strip().lower().replace(" ", "_")
    if normalized_name == "admin" and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Director cannot create admin role")
    if not 1 <= body.level <= 5:
        raise HTTPException(status_code=422, detail="Role level must be between 1 and 5")
    existing = session.exec(
        select(Role).where(Role.company_id == company_id, Role.name == normalized_name)
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Role name already exists in this company")
    role = Role(
        company_id=company_id,
        name=normalized_name,
        display_name=body.display_name,
        level=body.level,
        description=body.description,
        policy_doc=body.policy_doc,
        is_system=False,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


@router.post("/dependencies", response_model=RoleDependencyPublic, status_code=status.HTTP_201_CREATED)
def create_role_dependency(
    body: RoleDependencyCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("USER_MANAGE")),
):
    """Create role dependency with level and cycle validations."""

    from_role = session.get(Role, body.from_role_id)
    to_role = session.get(Role, body.to_role_id)
    if from_role is None or to_role is None:
        raise HTTPException(404, "Role not found")
    _ensure_same_company(body.company_id, from_role)
    _ensure_same_company(body.company_id, to_role)
    if body.from_role_id == body.to_role_id:
        raise HTTPException(422, "Role cannot depend on itself")

    if body.relation_type == "REPORTS_TO":
        if from_role.level <= to_role.level:
            raise HTTPException(422, "REPORTS_TO requires from_role lower hierarchy than to_role")
        _reports_to_cycle_check(session, body.company_id, body.from_role_id, body.to_role_id)
    if body.relation_type == "PEERS_WITH" and from_role.level != to_role.level:
        raise HTTPException(422, "PEERS_WITH requires equal role levels")
    if body.relation_type == "REQUIRES_APPROVAL_FROM" and to_role.level > from_role.level:
        raise HTTPException(422, "REQUIRES_APPROVAL_FROM must target equal or higher role")

    existing = session.exec(
        select(RoleDependency).where(
            RoleDependency.company_id == body.company_id,
            RoleDependency.from_role_id == body.from_role_id,
            RoleDependency.to_role_id == body.to_role_id,
            RoleDependency.relation_type == body.relation_type,
        )
    ).first()
    if existing:
        raise HTTPException(409, "Dependency already exists")

    row = RoleDependency(**body.model_dump(), is_active=True)
    session.add(row)

    if body.relation_type == "PEERS_WITH":
        reciprocal = session.exec(
            select(RoleDependency).where(
                RoleDependency.company_id == body.company_id,
                RoleDependency.from_role_id == body.to_role_id,
                RoleDependency.to_role_id == body.from_role_id,
                RoleDependency.relation_type == "PEERS_WITH",
            )
        ).first()
        if reciprocal is None:
            session.add(
                RoleDependency(
                    company_id=body.company_id,
                    from_role_id=body.to_role_id,
                    to_role_id=body.from_role_id,
                    relation_type="PEERS_WITH",
                    is_active=True,
                )
            )
    session.commit()
    session.refresh(row)
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


@router.post("/assignments", response_model=UserCompanyRolePublic, status_code=status.HTTP_201_CREATED)
def assign_user_company_role(
    body: UserCompanyRoleCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign role to user in a company with optional primary flag."""

    user = session.get(User, body.user_id)
    company = session.get(Company, body.company_id)
    role = session.get(Role, body.role_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if company is None:
        raise HTTPException(404, "Company not found")
    if role is None:
        raise HTTPException(404, "Role not found")
    if not _can_assign_role(session, current_user, body.company_id, role):
        raise HTTPException(status_code=403, detail="You are not allowed to assign this role")
    _ensure_same_company(body.company_id, role)

    existing = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == body.user_id,
            UserCompanyRole.company_id == body.company_id,
            UserCompanyRole.role_id == body.role_id,
        )
    ).first()
    if existing:
        existing.is_primary = body.is_primary
        assignment = existing
    else:
        assignment = UserCompanyRole(**body.model_dump())
        session.add(assignment)
        session.flush()

    if body.is_primary:
        rows = session.exec(
            select(UserCompanyRole).where(
                UserCompanyRole.user_id == body.user_id,
            )
        ).all()
        for row in rows:
            row.is_primary = row.role_id == body.role_id
            session.add(row)

    _sync_user_company_id_from_memberships(session, user)
    session.commit()
    session.refresh(assignment)
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


@router.get("/assignments/{user_id}", response_model=list[UserCompanyRolePublic])
def list_user_company_roles(
    user_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List role assignments of a user across companies."""

    rows = session.exec(
        select(UserCompanyRole).where(UserCompanyRole.user_id == user_id)
    ).all()
    result: list[UserCompanyRolePublic] = []
    for row in rows:
        company = session.get(Company, row.company_id)
        role = session.get(Role, row.role_id)
        if company is None or role is None:
            continue
        result.append(
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
    return result


@router.get("/me/profile", response_model=AccountProfilePublic)
def my_account_profile(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return account profile with company-role memberships."""

    rows = session.exec(
        select(UserCompanyRole).where(UserCompanyRole.user_id == current_user.id)
    ).all()
    memberships: list[AccountMembershipPublic] = []
    for row in rows:
        company = session.get(Company, row.company_id)
        role = session.get(Role, row.role_id)
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


@router.get("/org-tree", response_model=OrgTreePublic)
def get_org_tree(
    company_id: uuid.UUID = Query(...),
    department_id: uuid.UUID | None = Query(default=None),
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return organization tree grouped by department and sorted from low to high role levels."""

    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    assignments = session.exec(
        select(UserCompanyRole).where(UserCompanyRole.company_id == company_id)
    ).all()

    current_user_assignments = [row for row in assignments if row.user_id == current_user.id]
    if not current_user.is_superuser and not current_user_assignments:
        raise HTTPException(status_code=403, detail="You are not a member of this company")

    role_ids = {row.role_id for row in assignments}
    roles = session.exec(select(Role).where(Role.id.in_(role_ids))).all() if role_ids else []
    role_by_id = {role.id: role for role in roles}

    user_ids = {row.user_id for row in assignments}
    users = session.exec(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
    user_by_id = {user.id: user for user in users}

    department_ids = {user.department_id for user in users if user.department_id is not None}
    departments = (
        session.exec(select(Department).where(Department.id.in_(department_ids))).all()
        if department_ids
        else []
    )
    department_name_by_id = {dept.id: dept.name for dept in departments}

    current_primary = next((row for row in current_user_assignments if row.is_primary), None)
    if current_primary is None and current_user_assignments:
        current_primary = current_user_assignments[0]
    current_role = role_by_id.get(current_primary.role_id) if current_primary else None
    current_role_level = current_role.level if current_role else None

    rows_by_department: dict[uuid.UUID | None, list[UserCompanyRole]] = defaultdict(list)
    for row in assignments:
        user = user_by_id.get(row.user_id)
        if user is None:
            continue
        if department_id is not None and user.department_id != department_id:
            continue
        rows_by_department[user.department_id].append(row)

    department_groups: list[OrgTreeDepartmentGroupPublic] = []
    for dept_id, dept_rows in rows_by_department.items():
        role_to_members: dict[uuid.UUID, list[OrgTreeMemberPublic]] = defaultdict(list)
        for row in dept_rows:
            role = role_by_id.get(row.role_id)
            user = user_by_id.get(row.user_id)
            if role is None or user is None:
                continue
            role_to_members[role.id].append(
                OrgTreeMemberPublic(
                    user_id=user.id,
                    full_name=user.full_name,
                    email=user.email,
                    department_id=user.department_id,
                    department_name=department_name_by_id.get(user.department_id),
                    is_current_user=user.id == current_user.id,
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
                else:
                    relation = "peer"
            role_nodes.append(
                OrgTreeRoleNodePublic(
                    role_id=role.id,
                    role_name=role.name,
                    role_display_name=role.display_name,
                    role_level=role.level,
                    relation_to_current=relation,
                    members=sorted(members, key=lambda m: (m.full_name or m.email).lower()),
                )
            )
        role_nodes.sort(key=lambda node: node.role_level)

        department_groups.append(
            OrgTreeDepartmentGroupPublic(
                department_id=dept_id,
                department_name=department_name_by_id.get(dept_id, "No Department"),
                roles=role_nodes,
            )
        )

    department_groups.sort(key=lambda group: group.department_name.lower())

    return OrgTreePublic(
        company_id=company.id,
        company_name=company.name,
        current_user_id=current_user.id,
        current_role_id=current_role.id if current_role else None,
        current_role_level=current_role_level,
        departments=department_groups,
    )
