"""
Quotation domain models:
  Quotation, QuotationStageTransition,
  QuotationNegotiationLog, QuotationAttachment, QuotationVersion

NOTE: Sub-entity classes are intentionally placed BEFORE Quotation so that
Quotation.attachments etc. can reference them directly (no forward-ref quotes
needed). Back-references from sub-entities to Quotation use the string
"Quotation" because Quotation is defined later in the file.
No `from __future__ import annotations` — SQLModel 0.0.31 + SA 2.0
requires explicit forward-reference strings for later-defined models.
"""

import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from sqlalchemy import JSON, DateTime, Text
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Stage & Status constants
# ---------------------------------------------------------------------------

STAGE_LABELS: Dict[str, str] = {
    "S1_SALES_COLLECT": "Tiếp nhận & Khảo sát",
    "S2_DIRECTOR_APPROVE_SURVEY": "Giám đốc duyệt khảo sát",
    "S3_TECH_DESIGN": "Kỹ thuật lên thiết kế",
    "S3B_BOC_TACH": "Bóc tách khối lượng",
    "S4_DIRECTOR_APPROVE_DESIGN": "Giám đốc duyệt thiết kế",
    "S5_PROCUREMENT_PRICING": "Vật tư báo đơn giá",
    "S6_SALES_FINALIZE": "Kinh doanh hoàn thiện chào giá",
    "S7_DIRECTOR_APPROVE_QUOTE": "Giám đốc duyệt chào giá",
    "S8_SENT_TO_CLIENT": "Chờ phản hồi khách hàng",
    "S8B_NEGOTIATION_REVIEW": "Giám đốc duyệt thương lượng",
    "S9_CLOSED": "Đã kết thúc",
}

STAGE_ORDER: List[str] = list(STAGE_LABELS.keys())

# Stages that directors can reject back to any earlier stage
DIRECTOR_REJECT_STAGES: List[str] = [
    "S2_DIRECTOR_APPROVE_SURVEY",
    "S4_DIRECTOR_APPROVE_DESIGN",
    "S7_DIRECTOR_APPROVE_QUOTE",
    "S8B_NEGOTIATION_REVIEW",
]

# stage → list of (next_stage, required_permission, action_label)
STAGE_TRANSITIONS: Dict[str, List[tuple]] = {
    "S1_SALES_COLLECT": [
        ("S2_DIRECTOR_APPROVE_SURVEY", "QUOTATION_SUBMIT_SURVEY", "submit"),
    ],
    "S2_DIRECTOR_APPROVE_SURVEY": [
        ("S3_TECH_DESIGN", "QUOTATION_APPROVE_SURVEY", "approve"),
        ("S1_SALES_COLLECT", "QUOTATION_APPROVE_SURVEY", "reject"),
    ],
    "S3_TECH_DESIGN": [
        ("S3B_BOC_TACH", "QUOTATION_DESIGN", "submit"),
    ],
    "S3B_BOC_TACH": [
        ("S4_DIRECTOR_APPROVE_DESIGN", "QUOTATION_BOC_TACH", "submit"),
    ],
    "S4_DIRECTOR_APPROVE_DESIGN": [
        ("S5_PROCUREMENT_PRICING", "QUOTATION_APPROVE_DESIGN", "approve"),
        ("S3B_BOC_TACH", "QUOTATION_APPROVE_DESIGN", "reject"),
    ],
    "S5_PROCUREMENT_PRICING": [
        ("S6_SALES_FINALIZE", "QUOTATION_FILL_PRICE", "submit"),
    ],
    "S6_SALES_FINALIZE": [
        ("S7_DIRECTOR_APPROVE_QUOTE", "QUOTATION_FINALIZE", "submit"),
    ],
    "S7_DIRECTOR_APPROVE_QUOTE": [
        ("S8_SENT_TO_CLIENT", "QUOTATION_APPROVE_FINAL", "approve"),
        ("S6_SALES_FINALIZE", "QUOTATION_APPROVE_FINAL", "reject"),
    ],
    "S8_SENT_TO_CLIENT": [
        ("S8B_NEGOTIATION_REVIEW", "QUOTATION_SEND_CLIENT", "negotiate"),
        ("S9_CLOSED", "QUOTATION_CLOSE", "submit"),
    ],
    "S8B_NEGOTIATION_REVIEW": [
        ("S6_SALES_FINALIZE", "QUOTATION_APPROVE_NEGOTIATION", "approve"),
        ("S8_SENT_TO_CLIENT", "QUOTATION_APPROVE_NEGOTIATION", "reject"),
    ],
    "S9_CLOSED": [],
}

# Human-readable action labels for history display
ACTION_LABELS: Dict[str, str] = {
    "create": "Tạo hồ sơ báo giá",
    "submit_survey": "Kinh doanh đã nộp thông tin khảo sát",
    "approve_survey": "Giám đốc đã duyệt khảo sát",
    "reject_survey": "Giám đốc yêu cầu bổ sung khảo sát",
    "submit_design": "Kỹ thuật đã nộp file thiết kế",
    "submit_boc_tach": "Kỹ thuật đã hoàn thành bóc tách khối lượng",
    "approve_design": "Giám đốc đã duyệt thiết kế & bóc tách",
    "reject_design": "Giám đốc yêu cầu chỉnh lại thiết kế",
    "submit_pricing": "Vật tư đã nộp bảng đơn giá",
    "finalize": "Kinh doanh đã hoàn thiện hợp đồng chào giá",
    "approve_final": "Giám đốc đã duyệt chào giá",
    "reject_final": "Giám đốc yêu cầu chỉnh lại chào giá",
    "send_to_client": "Đã gửi chào giá cho khách hàng",
    "submit_negotiation": "Kinh doanh trình thương lượng lên Giám đốc",
    "approve_negotiation": "Giám đốc đồng ý điều chỉnh giá",
    "reject_negotiation": "Giám đốc chưa đồng ý, tiếp tục trao đổi",
    "close_won": "Khách hàng đã chấp nhận — Thắng hợp đồng",
    "close_lost": "Đóng hồ sơ — Không thành công",
}


# ---------------------------------------------------------------------------
# QuotationStageTransition — audit trail for stage changes
# ---------------------------------------------------------------------------

class QuotationStageTransition(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    from_stage: Optional[str] = Field(default=None, max_length=50)
    to_stage: str = Field(max_length=50)
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    action: str = Field(max_length=50)
    # semantic action code matching ACTION_LABELS keys
    note: Optional[str] = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    quotation: Optional["Quotation"] = Relationship(back_populates="transitions")


class QuotationStageTransitionPublic(SQLModel):
    id: uuid.UUID
    quotation_id: uuid.UUID
    from_stage: Optional[str]
    from_stage_label: Optional[str] = None
    to_stage: str
    to_stage_label: Optional[str] = None
    actor_id: uuid.UUID
    actor_name: Optional[str] = None
    action: str
    action_label: Optional[str] = None   # human-readable from ACTION_LABELS
    note: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# QuotationNegotiationLog — client interaction history
# ---------------------------------------------------------------------------

class QuotationNegotiationLogBase(SQLModel):
    contact_date: date
    contact_method: str = Field(max_length=20)
    # "phone" | "email" | "meeting" | "site_visit"
    summary: str = Field(sa_type=Text)
    client_feedback: Optional[str] = Field(default=None, sa_type=Text)
    requested_changes: Optional[str] = Field(default=None, sa_type=Text)
    follow_up_date: Optional[date] = None


class QuotationNegotiationLog(QuotationNegotiationLogBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    logged_by: uuid.UUID = Field(foreign_key="user.id")
    attachments: Optional[List[str]] = Field(default=None, sa_type=JSON)
    # list of file URLs
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    quotation: Optional["Quotation"] = Relationship(back_populates="negotiations")


class QuotationNegotiationLogCreate(QuotationNegotiationLogBase):
    attachments: Optional[List[str]] = None


class QuotationNegotiationLogPublic(QuotationNegotiationLogBase):
    id: uuid.UUID
    quotation_id: uuid.UUID
    logged_by: uuid.UUID
    logged_by_name: Optional[str] = None
    attachments: Optional[List[str]]
    created_at: datetime


# ---------------------------------------------------------------------------
# QuotationAttachment — technical drawings, documents
# ---------------------------------------------------------------------------

class QuotationAttachment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    uploaded_by: uuid.UUID = Field(foreign_key="user.id")
    file_url: str = Field(max_length=1000)
    file_name: str = Field(max_length=500)
    file_type: str = Field(default="document", max_length=30)
    # "drawing" | "spec_sheet" | "photo" | "document" | "quote_pdf"
    document_category: str = Field(default="other", max_length=30)
    # "design_file" | "pricing_file" | "quote_document" | "negotiation" | "other"
    stage_uploaded: str = Field(max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    uploaded_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    quotation: Optional["Quotation"] = Relationship(back_populates="attachments")


class QuotationAttachmentCreate(SQLModel):
    file_url: str
    file_name: str
    file_type: str = "document"
    document_category: str = "other"
    description: Optional[str] = None


class QuotationAttachmentPublic(SQLModel):
    id: uuid.UUID
    quotation_id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_by_name: Optional[str] = None
    file_url: str
    file_name: str
    file_type: str
    document_category: str
    stage_uploaded: str
    description: Optional[str]
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# QuotationVersion — snapshot when quote is sent or revised
# ---------------------------------------------------------------------------

class QuotationVersion(SQLModel, table=True):
    """
    Immutable snapshot of the quotation at a point in time.
    Created automatically when: GĐ approves final (S7→S8), or KD sends to client.
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    version_number: int
    snapshot_data: Any = Field(sa_type=JSON)
    # { total_contract_value, attachments: [{file_name, document_category, file_url}] }
    created_by: uuid.UUID = Field(foreign_key="user.id")
    reason: Optional[str] = Field(default=None, max_length=50)
    # "initial_approval" | "sent_to_client" | "client_revision" | "price_adjustment"
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    quotation: Optional["Quotation"] = Relationship(back_populates="versions")


class QuotationVersionPublic(SQLModel):
    id: uuid.UUID
    quotation_id: uuid.UUID
    version_number: int
    snapshot_data: Any
    created_by: uuid.UUID
    created_by_name: Optional[str] = None
    reason: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Quotation — core entity (defined AFTER sub-entities to avoid forward refs)
# ---------------------------------------------------------------------------

class QuotationBase(SQLModel):
    project_name: str = Field(max_length=500)
    client_company_name: str = Field(max_length=255)
    client_contact_name: Optional[str] = Field(default=None, max_length=255)
    client_contact_title: Optional[str] = Field(default=None, max_length=100)
    client_contact_phone: Optional[str] = Field(default=None, max_length=50)
    client_contact_email: Optional[str] = Field(default=None, max_length=255)
    client_address: Optional[str] = Field(default=None, sa_type=Text)
    equipment_category: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, sa_type=Text)
    survey_note: Optional[str] = Field(default=None, sa_type=Text)
    color: Optional[str] = Field(default=None, max_length=30)


class Quotation(QuotationBase, table=True):
    """
    Core quotation entity. Tracks the full quote lifecycle from
    initial contact to won/lost outcome.

    STATUS: draft | in_review | active | sent | negotiating | closed_won | closed_lost
    STAGE:  S1_SALES_COLLECT → S9_CLOSED  (9 steps)
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)

    # Auto-generated human-readable number, e.g. "BG-2026-001"
    quote_number: str = Field(max_length=30, index=True, unique=True)

    status: str = Field(default="draft", max_length=30)
    current_stage: str = Field(default="S1_SALES_COLLECT", max_length=50)

    # Survey
    site_survey_date: Optional[date] = None
    survey_start_date: Optional[date] = None
    survey_end_date: Optional[date] = None

    # Owners
    created_by: uuid.UUID = Field(foreign_key="user.id")
    sales_owner_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    technical_owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    procurement_owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")

    # Pricing — filled by Vật Tư at S5
    total_contract_value: Optional[float] = None
    currency: str = Field(default="VND", max_length=10)

    # Client interaction
    valid_until: Optional[date] = None
    sent_to_client_at: Optional[datetime] = None
    client_response_deadline: Optional[date] = None

    # Outcome
    outcome: Optional[str] = Field(default=None, max_length=10)
    lost_reason_category: Optional[str] = Field(default=None, max_length=50)
    lost_reason_detail: Optional[str] = Field(default=None, sa_type=Text)
    won_project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="project.id")

    # Soft delete
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    # Relationships — all sub-entity classes are defined above, no forward refs needed
    transitions: List[QuotationStageTransition] = Relationship(
        back_populates="quotation", cascade_delete=True
    )
    negotiations: List[QuotationNegotiationLog] = Relationship(
        back_populates="quotation", cascade_delete=True
    )
    attachments: List[QuotationAttachment] = Relationship(
        back_populates="quotation", cascade_delete=True
    )
    versions: List[QuotationVersion] = Relationship(
        back_populates="quotation", cascade_delete=True
    )


class QuotationCreate(QuotationBase):
    """Fields required to open a new quotation (Kinh Doanh)."""
    sales_owner_id: Optional[uuid.UUID] = None   # defaults to current_user if None


class QuotationUpdate(SQLModel):
    project_name: Optional[str] = None
    client_company_name: Optional[str] = None
    client_contact_name: Optional[str] = None
    client_contact_title: Optional[str] = None
    client_contact_phone: Optional[str] = None
    client_contact_email: Optional[str] = None
    client_address: Optional[str] = None
    equipment_category: Optional[str] = None
    notes: Optional[str] = None
    survey_note: Optional[str] = None
    site_survey_date: Optional[date] = None
    survey_start_date: Optional[date] = None
    survey_end_date: Optional[date] = None
    valid_until: Optional[date] = None
    client_response_deadline: Optional[date] = None
    technical_owner_id: Optional[uuid.UUID] = None
    procurement_owner_id: Optional[uuid.UUID] = None
    color: Optional[str] = None


class QuotationPublic(QuotationBase):
    id: uuid.UUID
    company_id: uuid.UUID
    quote_number: str
    status: str
    current_stage: str
    stage_label: Optional[str] = None
    site_survey_date: Optional[date]
    survey_start_date: Optional[date]
    survey_end_date: Optional[date]
    created_by: uuid.UUID
    sales_owner_id: uuid.UUID
    sales_owner_name: Optional[str] = None
    technical_owner_id: Optional[uuid.UUID]
    technical_owner_name: Optional[str] = None
    procurement_owner_id: Optional[uuid.UUID]
    procurement_owner_name: Optional[str] = None
    total_contract_value: Optional[float]
    currency: str
    valid_until: Optional[date]
    sent_to_client_at: Optional[datetime]
    client_response_deadline: Optional[date]
    outcome: Optional[str]
    lost_reason_category: Optional[str]
    lost_reason_detail: Optional[str]
    won_project_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class QuotationCompanyProfilePublic(SQLModel):
    """Latest remembered client-company info for quotation creation."""

    client_company_name: str
    client_contact_name: Optional[str] = None
    client_contact_title: Optional[str] = None
    client_contact_phone: Optional[str] = None
    client_contact_email: Optional[str] = None
    client_address: Optional[str] = None
    notes: Optional[str] = None
    survey_note: Optional[str] = None
    equipment_category: Optional[str] = None


class QuotationsPublic(SQLModel):
    data: List[QuotationPublic]
    count: int


# ---------------------------------------------------------------------------
# Workflow action request bodies
# ---------------------------------------------------------------------------

class QuotationSubmitSurveyRequest(SQLModel):
    """S1 → S2: KD nộp báo cáo khảo sát."""
    client_contact_name: Optional[str] = None
    client_contact_phone: Optional[str] = None
    client_contact_title: Optional[str] = None
    client_address: Optional[str] = None
    site_survey_date: Optional[date] = None
    survey_start_date: Optional[date] = None
    survey_end_date: Optional[date] = None
    note: Optional[str] = None


class QuotationApproveRequest(SQLModel):
    """BGĐ approve or reject a stage (S2, S4, S7, S8B).
    When action=reject, target_stage overrides the default reject destination.
    """
    action: Literal["approve", "reject"]
    note: Optional[str] = None
    target_stage: Optional[str] = None  # override reject destination


class QuotationSubmitBocTachRequest(SQLModel):
    """S3B: KT hoàn thành bóc tách khối lượng → S4."""
    note: Optional[str] = None


class QuotationSubmitDesignRequest(SQLModel):
    """S3 → S4: KT nộp thiết kế."""
    note: Optional[str] = None


class QuotationSubmitPricingRequest(SQLModel):
    """S5 → S6: VT upload file báo giá đã điền giá, nhập tổng giá trị hợp đồng."""
    total_contract_value: float
    note: Optional[str] = None


class QuotationFinalizeRequest(SQLModel):
    """S6 → S7: KD hoàn thiện hợp đồng chào giá (upload file + điều khoản), nộp GĐ duyệt."""
    note: Optional[str] = None


class QuotationSendToClientRequest(SQLModel):
    """S8: KD ghi nhận đã gửi khách hàng."""
    valid_until: Optional[date] = None
    client_response_deadline: Optional[date] = None
    note: Optional[str] = None


class QuotationSubmitNegotiationRequest(SQLModel):
    """S8 → S8B: KD ghi nhận thương lượng và trình GĐ duyệt."""
    note: str  # bắt buộc ghi rõ nội dung thương lượng


class QuotationCloseRequest(SQLModel):
    """S8 → S9: KD đóng hồ sơ."""
    outcome: Literal["won", "lost"]
    lost_reason_category: Optional[str] = None
    # Required when outcome=lost: "price" | "design" | "marketing" | "other"
    lost_reason_detail: Optional[str] = None
    note: Optional[str] = None
    # Thêm role ngoài level 1&2 vào dự án khi won (optional)
    extra_role_ids: Optional[List[uuid.UUID]] = None


# ---------------------------------------------------------------------------
# QuotationApprovalParticipant — co-approver / delegate for director stages
# ---------------------------------------------------------------------------

class QuotationApprovalParticipant(SQLModel, table=True):
    """Tracks additional approvers (co_approver / delegate / primary) for director stages."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    stage: str = Field(max_length=50)        # which stage this applies to
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    role: str = Field(max_length=20)         # "co_approver" | "delegate" | "primary"
    has_approved: bool = Field(default=False)
    approved_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))  # type: ignore


class QuotationApprovalParticipantPublic(SQLModel):
    id: uuid.UUID
    quotation_id: uuid.UUID
    stage: str
    user_id: uuid.UUID
    user_name: Optional[str] = None
    role: str
    has_approved: bool
    approved_at: Optional[datetime]
    created_at: datetime


class QuotationApprovalParticipantCreate(SQLModel):
    user_id: uuid.UUID
    role: str  # "co_approver" | "delegate"


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class QuotationReportSummary(SQLModel):
    total: int
    in_progress: int
    sent: int
    negotiating: int
    closed_won: int
    closed_lost: int
    win_rate: Optional[float]       # closed_won / (closed_won + closed_lost) × 100
    total_won_value: Optional[float]   # sum of total_contract_value for closed_won
    period_from: Optional[date]
    period_to: Optional[date]


class QuotationByClientRow(SQLModel):
    client_company_name: str
    total: int
    won: int
    lost: int
    in_progress: int
    win_rate: Optional[float]
    total_won_value: Optional[float]


class QuotationByEquipmentRow(SQLModel):
    equipment_category: str
    total: int
    won: int
    lost: int
    win_rate: Optional[float]


class QuotationLostReasonRow(SQLModel):
    lost_reason_category: str
    count: int
    percentage: float
