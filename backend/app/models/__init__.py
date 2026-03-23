"""
Re-export all models so Alembic and SQLModel can discover them.
Import order matters: base models first, then relations.
"""

# Core / Auth (keep backward compat with existing code)
from app.models.user import (  # noqa: F401
    User,
    UserBase,
    UserCreate,
    UserRegister,
    UserUpdate,
    UserUpdateMe,
    UpdatePassword,
    UserPublic,
    UsersPublic,
)

# Generic response schemas
from app.models.schemas import (  # noqa: F401
    Token,
    TokenPayload,
    NewPassword,
    Message,
    RefreshTokenRequest,
    LogoutRequest,
)

# Org & RBAC
from app.models.org import (  # noqa: F401
    Department,
    Role,
    Permission,
    RolePermission,
    ProjectMemberRole,
    UserGlobalRole,
)

# Project
from app.models.project import (  # noqa: F401
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectPublic,
    ProjectsPublic,
    TaskLevelConfig,
)

# Task
from app.models.task import (  # noqa: F401
    Task,
    TaskCreate,
    TaskUpdate,
    TaskPublic,
    TasksPublic,
    TaskChecklist,
    TaskChecklistCreate,
    TaskChecklistUpdate,
    TaskChecklistPublic,
    TaskDependency,
    TaskObserver,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskProof,
    TaskProofCreate,
    AuditLog,
)
