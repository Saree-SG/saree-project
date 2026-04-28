"""
Contract domain models.

Sub-entities (ContractAttachment, ContractStatusTransition) are defined
BEFORE Contract so Contract can reference them in Relationship() directly.
Back-references use forward-ref string "Contract".
"""

import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Status constants
# ---------------------------------------------------------------------------

CONTRACT_STATUS_LABELS: dict[str, str] = {
    "draft": "Bản nháp",
    "pending_approval": "Chờ BGĐ duyệt",
    "sent": "Đã gửi khách",
    "signed": "Đã ký",
    "advance_received": "Đã nhận tạm ứng",
    "in_production": "Đang sản xuất",
    "completed": "Hoàn thành",
}

CONTRACT_STATUS_ORDER = list(CONTRACT_STATUS_LABELS.keys())


# ---------------------------------------------------------------------------
# ContractAttachment — defined BEFORE Contract
# ---------------------------------------------------------------------------

class ContractAttachment(SQLModel, table=True):
    __tablename__ = "contractattachment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    contract_id: uuid.UUID = Field(foreign_key="contract.id", index=True)
    uploaded_by: uuid.UUID = Field(foreign_key="user.id")
    file_url: str = Field(max_length=1000)
    file_name: str = Field(max_length=500)
    file_type: str = Field(default="document", max_length=30)
    phase: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    uploaded_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    contract: Optional["Contract"] = Relationship(back_populates="attachments")


class ContractAttachmentPublic(SQLModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    uploaded_by: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    phase: Optional[str]
    description: Optional[str]
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# ContractStatusTransition — defined BEFORE Contract
# ---------------------------------------------------------------------------

class ContractStatusTransition(SQLModel, table=True):
    __tablename__ = "contractstatustransition"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    contract_id: uuid.UUID = Field(foreign_key="contract.id", index=True)
    from_status: Optional[str] = Field(default=None, max_length=50)
    to_status: str = Field(max_length=50)
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    actor_name: Optional[str] = Field(default=None, max_length=255)
    action: str = Field(max_length=30)
    note: Optional[str] = Field(default=None, sa_type=Text())
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    contract: Optional["Contract"] = Relationship(back_populates="transitions")


class ContractStatusTransitionPublic(SQLModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    from_status: Optional[str]
    to_status: str
    actor_id: uuid.UUID
    actor_name: Optional[str]
    action: str
    note: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Contract (root entity)
# ---------------------------------------------------------------------------

class ContractBase(SQLModel):
    contract_date: date
    total_value: float
    currency: str = Field(default="VND", max_length=10)
    advance_amount: Optional[float] = None
    notes: Optional[str] = Field(default=None, sa_type=Text())


class Contract(ContractBase, table=True):
    __tablename__ = "contract"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    quotation_id: uuid.UUID = Field(foreign_key="quotation.id", index=True, unique=True)
    project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="project.id", index=True)
    contract_number: str = Field(max_length=30, index=True)
    signing_date: Optional[date] = None
    status: str = Field(default="draft", max_length=30)
    advance_paid_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    advance_paid_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_by: uuid.UUID = Field(foreign_key="user.id")
    is_deleted: bool = False
    deleted_at: Optional[datetime] = Field(default=None, sa_type=DateTime())
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    attachments: List[ContractAttachment] = Relationship(
        back_populates="contract",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    transitions: List[ContractStatusTransition] = Relationship(
        back_populates="contract",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ContractCreate(ContractBase):
    quotation_id: uuid.UUID
    project_id: Optional[uuid.UUID] = None


class ContractUpdate(SQLModel):
    contract_date: Optional[date] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    advance_amount: Optional[float] = None
    notes: Optional[str] = None
    signing_date: Optional[date] = None


class ContractPublic(ContractBase):
    id: uuid.UUID
    company_id: uuid.UUID
    quotation_id: uuid.UUID
    project_id: Optional[uuid.UUID]
    contract_number: str
    signing_date: Optional[date]
    status: str
    status_label: Optional[str] = None
    advance_paid_at: Optional[datetime]
    advance_paid_by: Optional[uuid.UUID]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ContractWithDetailsPublic(ContractPublic):
    attachments: List[ContractAttachmentPublic] = []
    transitions: List[ContractStatusTransitionPublic] = []


class ContractsPublic(SQLModel):
    data: List[ContractPublic]
    count: int


# ---------------------------------------------------------------------------
# Workflow action schemas
# ---------------------------------------------------------------------------

class ContractActionRequest(SQLModel):
    note: Optional[str] = None


class ContractSignRequest(SQLModel):
    signing_date: date
    note: Optional[str] = None


class ContractConfirmAdvanceRequest(SQLModel):
    advance_amount: float
    advance_paid_at: datetime
    note: Optional[str] = None


class ContractAttachmentCreate(SQLModel):
    file_url: str
    file_name: str
    file_type: str = "document"
    description: Optional[str] = None
