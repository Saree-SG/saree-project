"""
Quotation domain models:
  Quotation, QuotationLineItem, QuotationStageTransition,
  QuotationNegotiationLog, QuotationAttachment, QuotationVersion

NOTE: Sub-entity classes are intentionally placed BEFORE Quotation so that
Quotation.line_items etc. can reference them directly (no forward-ref quotes
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
    "S1_SALES_COLLECT": "Thu thập thông tin",
    "S2_DIRECTOR_APPROVE_SURVEY": "BGĐ duyệt khảo sát",
    "S3_TECH_DESIGN": "Kỹ thuật thiết kế",
    "S4_DIRECTOR_APPROVE_DESIGN": "BGĐ duyệt thiết kế",
    "S5_PROCUREMENT_PRICING": "Vật tư định giá",
    "S6_SALES_FINALIZE": "Kinh doanh hoàn thiện",
    "S7_DIRECTOR_APPROVE_QUOTE": "BGĐ duyệt báo giá",
    "S8_SENT_TO_CLIENT": "Đã gửi khách hàng",
    "S9_CLOSED": "Kết thúc",
}

STAGE_ORDER: List[str] = list(STAGE_LABELS.keys())

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
        ("S4_DIRECTOR_APPROVE_DESIGN", "QUOTATION_DESIGN", "submit"),
    ],
    "S4_DIRECTOR_APPROVE_DESIGN": [
        ("S5_PROCUREMENT_PRICING", "QUOTATION_APPROVE_DESIGN", "approve"),
        ("S3_TECH_DESIGN", "QUOTATION_APPROVE_DESIGN", "reject"),
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
        ("S9_CLOSED", "QUOTATION_CLOSE", "submit"),
    ],
    "S9_CLOSED": [],
}


# ---------------------------------------------------------------------------
# QuotationLineItem — defined BEFORE Quotation so Quotation can reference it
# ---------------------------------------------------------------------------

class QuotationLineItemBase(SQLModel):
    sort_order: int = 0
    category: Optional[str] = Field(default=None, max_length=100)
    item_code: Optional[str] = Field(default=None, max_length=50)
    description: str = Field(max_length=1000)
    specifications: Optional[str] = Field(default=None, sa_type=Text)
    unit: str = Field(max_length=30)        # cái, m, kg, bộ, ...
    quantity: float


class QuotationLineItem(QuotationLineItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)

    # Filled by Vật Tư (S5)
    cost_unit_price: Optional[float] = None
    cost_total: Optional[float] = None         # quantity × cost_unit_price
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_lead_time_days: Optional[int] = None
    procurement_note: Optional[str] = Field(default=None, sa_type=Text)

    # Filled by Kinh Doanh after pricing (computed from price_coefficient)
    sale_unit_price: Optional[float] = None
    sale_total: Optional[float] = None         # quantity × sale_unit_price

    created_by_role: str = Field(default="technical", max_length=30)
    # "technical" | "procurement"

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    # Back-reference — Quotation is defined later, use string forward-ref
    quotation: Optional["Quotation"] = Relationship(back_populates="line_items")


class QuotationLineItemCreate(QuotationLineItemBase):
    pass


class QuotationLineItemUpdate(SQLModel):
    sort_order: Optional[int] = None
    category: Optional[str] = None
    item_code: Optional[str] = None
    description: Optional[str] = None
    specifications: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None


class QuotationLineItemPriceUpdate(SQLModel):
    """Only Vật Tư can update these fields (S5)."""
    cost_unit_price: Optional[float] = None
    supplier_name: Optional[str] = None
    supplier_lead_time_days: Optional[int] = None
    procurement_note: Optional[str] = None


class QuotationLineItemSalePriceUpdate(SQLModel):
    """KD update giá bán khi thương lượng (S8 negotiating)."""
    sale_unit_price: float


class QuotationLineItemPublic(QuotationLineItemBase):
    id: uuid.UUID
    quotation_id: uuid.UUID
    cost_unit_price: Optional[float]
    cost_total: Optional[float]
    supplier_name: Optional[str]
    supplier_lead_time_days: Optional[int]
    procurement_note: Optional[str]
    sale_unit_price: Optional[float]
    sale_total: Optional[float]
    created_by_role: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# QuotationStageTransition — audit trail for stage changes
# ---------------------------------------------------------------------------

class QuotationStageTransition(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    from_stage: Optional[str] = Field(default=None, max_length=50)
    to_stage: str = Field(max_length=50)
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    action: str = Field(max_length=20)
    # "submit" | "approve" | "reject" | "reopen"
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
    description: Optional[str] = None


class QuotationAttachmentPublic(SQLModel):
    id: uuid.UUID
    quotation_id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_by_name: Optional[str] = None
    file_url: str
    file_name: str
    file_type: str
    stage_uploaded: str
    description: Optional[str]
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# QuotationVersion — snapshot when quote is sent or revised
# ---------------------------------------------------------------------------

class QuotationVersion(SQLModel, table=True):
    """
    Immutable snapshot of the quotation at a point in time.
    Created automatically when: BGĐ approves final (S7→S8), or KD sends to client.
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True)
    version_number: int
    snapshot_data: Any = Field(sa_type=JSON)
    # { line_items: [...], total_cost_price, total_sale_price, price_coefficient }
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
    client_contact_phone: Optional[str] = Field(default=None, max_length=50)
    client_contact_email: Optional[str] = Field(default=None, max_length=255)
    client_address: Optional[str] = Field(default=None, sa_type=Text)
    equipment_category: Optional[str] = Field(default=None, max_length=100)
    # e.g. "IQF", "kho lạnh", "băng chuyền", "hệ thống lạnh"
    notes: Optional[str] = Field(default=None, sa_type=Text)


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

    # Owners
    created_by: uuid.UUID = Field(foreign_key="user.id")
    sales_owner_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    technical_owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    procurement_owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")

    # Pricing
    price_coefficient: Optional[float] = None
    total_cost_price: Optional[float] = None
    total_sale_price: Optional[float] = None
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
    line_items: List[QuotationLineItem] = Relationship(
        back_populates="quotation", cascade_delete=True
    )
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
    client_contact_phone: Optional[str] = None
    client_contact_email: Optional[str] = None
    client_address: Optional[str] = None
    equipment_category: Optional[str] = None
    notes: Optional[str] = None
    site_survey_date: Optional[date] = None
    valid_until: Optional[date] = None
    client_response_deadline: Optional[date] = None
    technical_owner_id: Optional[uuid.UUID] = None
    procurement_owner_id: Optional[uuid.UUID] = None


class QuotationPublic(QuotationBase):
    id: uuid.UUID
    company_id: uuid.UUID
    quote_number: str
    status: str
    current_stage: str
    stage_label: Optional[str] = None
    site_survey_date: Optional[date]
    created_by: uuid.UUID
    sales_owner_id: uuid.UUID
    sales_owner_name: Optional[str] = None
    technical_owner_id: Optional[uuid.UUID]
    technical_owner_name: Optional[str] = None
    procurement_owner_id: Optional[uuid.UUID]
    procurement_owner_name: Optional[str] = None
    price_coefficient: Optional[float]
    total_cost_price: Optional[float]
    total_sale_price: Optional[float]
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


class QuotationsPublic(SQLModel):
    data: List[QuotationPublic]
    count: int


# ---------------------------------------------------------------------------
# Workflow action request bodies
# ---------------------------------------------------------------------------

class QuotationSubmitSurveyRequest(SQLModel):
    """S1 → S2: KD nộp báo cáo khảo sát."""
    site_survey_date: Optional[date] = None
    note: Optional[str] = None


class QuotationApproveRequest(SQLModel):
    """BGĐ approve or reject a stage (S2, S4, S7)."""
    action: Literal["approve", "reject"]
    note: Optional[str] = None


class QuotationSubmitDesignRequest(SQLModel):
    """S3 → S4: KT nộp thiết kế."""
    note: Optional[str] = None


class QuotationSubmitPricingRequest(SQLModel):
    """S5 → S6: VT xác nhận đã điền đủ giá."""
    note: Optional[str] = None


class QuotationFinalizeRequest(SQLModel):
    """S6 → S7: KD hoàn thiện bảng giá bán, nộp BGĐ duyệt.

    Có 2 cách định giá:
    - price_coefficient: áp hệ số lên toàn bộ hạng mục (ghi đè sale_unit_price của từng item).
    - Để trống: giữ nguyên sale_unit_price đã set từng item; tất cả items phải có giá.
    """
    price_coefficient: Optional[float] = None  # None = dùng giá từng item
    note: Optional[str] = None


class QuotationSendToClientRequest(SQLModel):
    """S8: KD ghi nhận đã gửi khách hàng."""
    valid_until: Optional[date] = None
    client_response_deadline: Optional[date] = None
    note: Optional[str] = None


class QuotationNegotiateRequest(SQLModel):
    """S8: KD bắt đầu/tiếp tục thương lượng với khách hàng."""
    note: Optional[str] = None


class QuotationRequestRevisionRequest(SQLModel):
    """S8 → S6: Khách yêu cầu điều chỉnh giá → quay lại Kinh Doanh hoàn thiện."""
    note: str  # bắt buộc ghi rõ lý do khách yêu cầu


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
    total_won_value: Optional[float]
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
