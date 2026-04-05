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
    AccountProfilePublic,
    OrgTreeDepartmentGroupPublic,
    OrgTreeMemberPublic,
    OrgTreePublic,
    OrgTreeRoleNodePublic,
    CompanyCreate,
    CompanyPublic,
    CompanyUpdate,
    DepartmentCreate,
    DepartmentPublic,
    Department,
    Role,
    RoleCreate,
    RoleDependency,
    RoleDependencyCreate,
    RoleDependencyPublic,
    Permission,
    RolePermission,
    ProjectMemberRole,
    UserCompanyRole,
    UserCompanyRoleCreate,
    UserCompanyRolePublic,
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
    TaskProgressReport,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskProgressPhotoUploadPublic,
    TaskDependency,
    TaskObserver,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskProof,
    TaskProofCreate,
    AuditLog,
)

# Chat
from app.models.chat import (  # noqa: F401
    ChatRoom,
    ChatRoomCreate,
    ChatRoomUpdate,
    ChatRoomPublic,
    ChatMember,
    ChatMemberAdd,
    ChatMemberPublic,
    ChatMemberWithUserPublic,
    ChatMessage,
    ChatMessageCreate,
    ChatMessagePublic,
    ChatAttachment,
    ChatAttachmentPublic,
)
