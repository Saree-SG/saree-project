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
    QuotationLineItem,
    QuotationNegotiationLog,
    QuotationStageTransition,
    QuotationVersion,
)

# Procurement
from app.models.procurement import (  # noqa: F401
    PurchaseRequest,
    PurchaseRequestItem,
    PurchaseOrder,
    PurchaseOrderItem,
    SupplierQuote,
)

# Contract
from app.models.contract import (  # noqa: F401
    Contract,
    ContractAttachment,
    ContractStatusTransition,
)

# Supplier
from app.models.supplier import (  # noqa: F401
    Supplier,
    SupplierCreate,
    SupplierPublic,
    SuppliersPublic,
    SupplierUpdate,
)

# Inventory
from app.models.inventory import (  # noqa: F401
    InventoryItem,
    MaterialIssueAttachment,
    MaterialIssue,
    MaterialIssueItem,
    StockMovement,
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
