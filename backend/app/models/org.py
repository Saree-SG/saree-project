"""
Org & RBAC models:
  Company, Department, Role, Permission, RolePermission, UserGlobalRole, ProjectMemberRole
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import JSON, DateTime, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Company (multi-tenant root)
# ---------------------------------------------------------------------------
class Company(SQLModel, table=True):
    """Root tenant. Every other entity belongs to a Company."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255, index=True)
    slug: str = Field(max_length=100, unique=True, index=True)  # e.g. "acme-corp"
    is_active: bool = True
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    # Site location for "by-company" attendance check-in (GPS verification).
    # A worker checking in against the company (rather than a specific project
    # site) is validated against these coordinates, same as a project site.
    site_lat: float | None = None
    site_lng: float | None = None
    site_radius_m: int = Field(default=150)   # allowed check-in radius (metres)

    departments: list["Department"] = Relationship(back_populates="company")
    roles: list["Role"] = Relationship(back_populates="company")
    user_company_roles: list["UserCompanyRole"] = Relationship(back_populates="company")
    role_dependencies: list["RoleDependency"] = Relationship(back_populates="company")
    projects: list["Project"] = Relationship(back_populates="company")  # type: ignore


class CompanyCreate(SQLModel):
    name: str = Field(max_length=255)
    slug: str = Field(max_length=100)


class CompanyPublic(SQLModel):
    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    site_lat: float | None = None
    site_lng: float | None = None
    site_radius_m: int = 150


class CompanyUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


# ---------------------------------------------------------------------------
# Department (tree structure via parent_id)
# ---------------------------------------------------------------------------
class Department(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    parent_id: uuid.UUID | None = Field(default=None, foreign_key="department.id", index=True)
    name: str = Field(max_length=255)
    dept_type: str | None = Field(default=None, max_length=50)  # "project_block" | "office_block"
    is_active: bool = True
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    company: Company = Relationship(back_populates="departments")
    # Note: children/parent self-reference handled at query level to avoid circular Relationship


class DepartmentPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    dept_type: str | None
    is_active: bool


class DepartmentCreate(SQLModel):
    name: str = Field(max_length=255)
    parent_id: uuid.UUID | None = None
    dept_type: str | None = None


class DepartmentUpdate(SQLModel):
    name: str | None = Field(default=None, max_length=255)
    dept_type: str | None = None
    is_active: bool | None = None
    parent_id: uuid.UUID | None = None


class UserDepartmentAssign(SQLModel):
    user_id: uuid.UUID
    department_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Role
# ---------------------------------------------------------------------------
class Role(SQLModel, table=True):
    """
    Roles are DATA, not code.
    System roles (is_system=True) are seeded and cannot be deleted.
    Custom roles are created by admin via UI.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    name: str = Field(max_length=100)          # "admin" | "director" | "manager" | "worker"
    display_name: str = Field(max_length=100)  # Displayed on UI: "Giám đốc", "Quản lý"
    level: int = Field(default=3)              # 1=Board, 2=Manager, 3=Staff
    is_system: bool = False                    # System roles cannot be deleted
    description: str | None = Field(default=None, max_length=500)
    policy_doc: dict[str, Any] | None = Field(default=None, sa_type=JSON)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    company: Company = Relationship(back_populates="roles")
    permissions: list["RolePermission"] = Relationship(back_populates="role", cascade_delete=True)
    global_user_roles: list["UserGlobalRole"] = Relationship(back_populates="role")
    user_company_roles: list["UserCompanyRole"] = Relationship(back_populates="role")
    outgoing_dependencies: list["RoleDependency"] = Relationship(
        back_populates="from_role",
        sa_relationship_kwargs={"foreign_keys": "[RoleDependency.from_role_id]"},
    )
    incoming_dependencies: list["RoleDependency"] = Relationship(
        back_populates="to_role",
        sa_relationship_kwargs={"foreign_keys": "[RoleDependency.to_role_id]"},
    )
    project_member_roles: list["ProjectMemberRole"] = Relationship(back_populates="role")


class RolePublic(SQLModel):
    id: uuid.UUID
    name: str
    display_name: str
    level: int
    is_system: bool
    description: str | None


class RoleCreate(SQLModel):
    name: str
    display_name: str
    level: int = 3
    description: str | None = None
    policy_doc: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Permission
# ---------------------------------------------------------------------------
class Permission(SQLModel, table=True):
    """
    All system actions. Seeded once, never deleted.
    New modules add new Permission rows (INSERT only, no code change).

    code format: MODULE_ACTION[_SCOPE]
    Examples:
      TASK_CREATE, TASK_UPDATE_STATUS, TASK_DELETE
      PROJECT_VIEW, PROJECT_CREATE
      PROOF_UPLOAD, PROOF_APPROVE
      CHECKIN_CREATE (future), APPROVAL_SUBMIT (future)
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=100, unique=True, index=True)  # "TASK_CREATE"
    module: str = Field(max_length=50)                           # "task" | "project" | "checkin"
    action: str = Field(max_length=50)                           # "create" | "read" | "update" | "delete" | "approve" | "export"
    scope: str = Field(max_length=50)                            # "own" | "team" | "department" | "project" | "global"
    description: str = Field(sa_type=Text)                       # Human-readable, shown on UI

    role_permissions: list["RolePermission"] = Relationship(back_populates="permission", cascade_delete=True)


class PermissionPublic(SQLModel):
    id: uuid.UUID
    code: str
    module: str
    action: str
    scope: str
    description: str


class RolePermissionAssignRequest(SQLModel):
    """Payload to replace a role's permission set."""

    permission_codes: list[str]


class RolePermissionAssignResponse(SQLModel):
    """Result of role permission assignment."""

    role_id: uuid.UUID
    assigned_permission_codes: list[str]


# ---------------------------------------------------------------------------
# RolePermission (N:N Role ↔ Permission)
# ---------------------------------------------------------------------------
class RolePermission(SQLModel, table=True):
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)
    permission_id: uuid.UUID = Field(foreign_key="permission.id", primary_key=True)

    role: Role = Relationship(back_populates="permissions")
    permission: Permission = Relationship(back_populates="role_permissions")


# ---------------------------------------------------------------------------
# UserGlobalRole — Global role assignment (company-wide)
# ---------------------------------------------------------------------------
class UserGlobalRole(SQLModel, table=True):
    """A user's role at company level (e.g. 'Director' globally)."""
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", primary_key=True)
    assigned_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    user: "User" = Relationship(back_populates="global_roles")  # type: ignore
    role: Role = Relationship(back_populates="global_user_roles")


class UserCompanyRole(SQLModel, table=True):
    """Role assignment of user inside a company."""

    __table_args__ = (UniqueConstraint("user_id", "company_id", "role_id"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    is_primary: bool = False
    assigned_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    user: "User" = Relationship(back_populates="company_roles")  # type: ignore
    company: Company = Relationship(back_populates="user_company_roles")
    role: Role = Relationship(back_populates="user_company_roles")


class UserCompanyRoleCreate(SQLModel):
    user_id: uuid.UUID
    company_id: uuid.UUID
    role_id: uuid.UUID
    is_primary: bool = False


class UserCompanyRolePublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    company_id: uuid.UUID
    role_id: uuid.UUID
    role_name: str
    role_display_name: str
    company_name: str
    is_primary: bool
    assigned_at: datetime


class CompanyMemberPublic(SQLModel):
    """Member projection for company management UI."""

    user_id: uuid.UUID
    email: str
    full_name: str | None
    role_id: uuid.UUID
    role_name: str
    role_display_name: str
    role_level: int
    is_primary: bool
    department_id: uuid.UUID | None = None


class CompanyMemberRoleUpdateRequest(SQLModel):
    """Payload to update company member role assignment."""

    current_role_id: uuid.UUID
    new_role_id: uuid.UUID
    is_primary: bool = False


class RoleDependency(SQLModel, table=True):
    """Dependency graph between roles in same company."""

    __table_args__ = (
        UniqueConstraint("company_id", "from_role_id", "to_role_id", "relation_type"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    from_role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    to_role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    relation_type: str = Field(max_length=40)
    is_active: bool = True
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    company: Company = Relationship(back_populates="role_dependencies")
    from_role: Role = Relationship(
        back_populates="outgoing_dependencies",
        sa_relationship_kwargs={"foreign_keys": "[RoleDependency.from_role_id]"},
    )
    to_role: Role = Relationship(
        back_populates="incoming_dependencies",
        sa_relationship_kwargs={"foreign_keys": "[RoleDependency.to_role_id]"},
    )


class RoleDependencyCreate(SQLModel):
    company_id: uuid.UUID
    from_role_id: uuid.UUID
    to_role_id: uuid.UUID
    relation_type: Literal["REPORTS_TO", "PEERS_WITH", "REQUIRES_APPROVAL_FROM"]


class RoleDependencyPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    from_role_id: uuid.UUID
    from_role_name: str
    to_role_id: uuid.UUID
    to_role_name: str
    relation_type: str
    is_active: bool
    created_at: datetime


class AccountMembershipPublic(SQLModel):
    company_id: uuid.UUID
    company_name: str
    role_id: uuid.UUID
    role_name: str
    role_display_name: str
    role_level: int
    is_primary: bool


class AccountProfilePublic(SQLModel):
    user_id: uuid.UUID
    email: str
    full_name: str | None
    memberships: list[AccountMembershipPublic]


class OrgTreeMemberPublic(SQLModel):
    user_id: uuid.UUID
    full_name: str | None
    email: str
    department_id: uuid.UUID | None
    department_name: str | None
    is_current_user: bool = False


class OrgTreeRoleNodePublic(SQLModel):
    role_id: uuid.UUID
    role_name: str
    role_display_name: str
    role_level: int
    relation_to_current: str
    members: list[OrgTreeMemberPublic]


class OrgTreeDepartmentGroupPublic(SQLModel):
    department_id: uuid.UUID | None
    department_name: str
    roles: list[OrgTreeRoleNodePublic]


class OrgTreePublic(SQLModel):
    company_id: uuid.UUID
    company_name: str
    current_user_id: uuid.UUID
    current_role_id: uuid.UUID | None
    current_role_level: int | None
    departments: list[OrgTreeDepartmentGroupPublic]


# ---------------------------------------------------------------------------
# ProjectMemberRole — Contextual role within a specific project
# ---------------------------------------------------------------------------
class ProjectMemberRole(SQLModel, table=True):
    """
    A user's role WITHIN a specific project.
    Example: User A is 'Worker' globally, but 'Manager' in Project X.
    This contextual role OVERRIDES global role for permission checks within the project.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    role_id: uuid.UUID = Field(foreign_key="role.id")
    joined_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    user: "User" = Relationship(back_populates="project_roles")  # type: ignore
    role: Role = Relationship(back_populates="project_member_roles")
    project: "Project" = Relationship(back_populates="members")  # type: ignore


class ProjectMemberPublic(SQLModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role_id: uuid.UUID
    joined_at: datetime


class ProjectMemberWithUserPublic(SQLModel):
    """Project membership with resolved user and role labels for API clients."""

    user_id: uuid.UUID
    role_id: uuid.UUID
    joined_at: datetime
    full_name: str | None = None
    email: str
    role_display_name: str
