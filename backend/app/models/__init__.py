"""
Re-export all models so Alembic and SQLModel can discover them.
Import order matters: base models first, then relations.
"""

# Core / Auth (keep backward compat with existing code)
# Notifications
from app.models.notification import (  # noqa: F401
    Notification,
    NotificationPublic,
    NotificationUnreadCount,
)

# Chat
from app.models.chat import (  # noqa: F401
    ChatAttachment,
    ChatAttachmentPublic,
    ChatMember,
    ChatMemberAdd,
    ChatMemberPublic,
    ChatMemberWithUserPublic,
    ChatMessage,
    ChatMessageCreate,
    ChatMessagePublic,
    ChatRoom,
    ChatRoomCreate,
    ChatRoomPublic,
    ChatRoomUpdate,
)

# Org & RBAC
from app.models.org import (  # noqa: F401
    AccountProfilePublic,
    CompanyCreate,
    CompanyMemberPublic,
    CompanyMemberRoleUpdateRequest,
    CompanyPublic,
    CompanyUpdate,
    Department,
    DepartmentCreate,
    DepartmentPublic,
    OrgTreeDepartmentGroupPublic,
    OrgTreeMemberPublic,
    OrgTreePublic,
    OrgTreeRoleNodePublic,
    Permission,
    PermissionPublic,
    ProjectMemberRole,
    ProjectMemberWithUserPublic,
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
    UserGlobalRole,
)

# Outbox / background jobs
from app.models.outbox import (  # noqa: F401
    CascadeRequest,
    CascadeRequestPublic,
    OutboxEvent,
    OutboxEventPublic,
)

# Project
from app.models.project import (  # noqa: F401
    Project,
    ProjectCreate,
    ProjectPublic,
    ProjectsPublic,
    ProjectUpdate,
    TaskLevelConfig,
)

# Generic response schemas
from app.models.schemas import (  # noqa: F401
    LogoutRequest,
    Message,
    NewPassword,
    RefreshTokenRequest,
    Token,
    TokenPayload,
)

# Quotation
from app.models.quotation import (  # noqa: F401
    Quotation,
    QuotationAttachment,
    QuotationNegotiationLog,
    QuotationStageTransition,
    QuotationVersion,
)

# Contract
from app.models.contract import (  # noqa: F401
    Contract,
    ContractAttachment,
    ContractStatusTransition,
)

# Material Request
from app.models.material_request import (  # noqa: F401
    MaterialRequest,
    MaterialRequestAttachment,
)

# Task
from app.models.task import (  # noqa: F401
    AuditLog,
    Task,
    TaskAssignee,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCreate,
    TaskDependency,
    TaskObserver,
    TaskProgressPhotoUploadPublic,
    TaskProgressReport,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskProof,
    TaskProofCreate,
    TaskPublic,
    TaskLinkedEntity,
    TasksPublic,
    TaskUpdate,
)
from app.models.user import (  # noqa: F401
    UpdatePassword,
    User,
    UserBase,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)
