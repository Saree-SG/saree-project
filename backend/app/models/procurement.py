"""
Procurement domain models.

Build order (sub-entities before root):
  PurchaseRequestItem → SupplierQuote → PurchaseOrderItem → PurchaseOrder → PurchaseRequest
"""

import uuid
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# PurchaseRequestItem — leaf of PurchaseRequest
# ---------------------------------------------------------------------------

class PurchaseRequestItemBase(SQLModel):
    item_name: str = Field(max_length=500)
    specifications: Optional[str] = Field(default=None, sa_type=Text())
    unit: str = Field(max_length=30)
    quantity: float
    tech_note: Optional[str] = Field(default=None, sa_type=Text())
    urgency_note: Optional[str] = Field(default=None, max_length=500)


class PurchaseRequestItem(PurchaseRequestItemBase, table=True):
    __tablename__ = "purchaserequestitem"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    request_id: uuid.UUID = Field(foreign_key="purchaserequest.id", index=True)
    ordered_quantity: float = 0.0
    received_quantity: float = 0.0

    request: Optional["PurchaseRequest"] = Relationship(back_populates="items")


class PurchaseRequestItemCreate(PurchaseRequestItemBase):
    pass


class PurchaseRequestItemPublic(PurchaseRequestItemBase):
    id: uuid.UUID
    request_id: uuid.UUID
    ordered_quantity: float
    received_quantity: float


# ---------------------------------------------------------------------------
# SupplierQuote — 3 quotes per PurchaseOrderItem
# ---------------------------------------------------------------------------

class SupplierQuote(SQLModel, table=True):
    __tablename__ = "supplierquote"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    po_item_id: uuid.UUID = Field(foreign_key="purchaseorderitem.id", index=True)
    supplier_id: uuid.UUID = Field(foreign_key="supplier.id", index=True)
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    unit_price: float
    lead_time_days: Optional[int] = None
    notes: Optional[str] = Field(default=None, sa_type=Text())
    is_selected: bool = False
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    po_item: Optional["PurchaseOrderItem"] = Relationship(back_populates="supplier_quotes")


class SupplierQuoteCreate(SQLModel):
    supplier_id: uuid.UUID
    unit_price: float
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None


class SupplierQuoteUpdate(SQLModel):
    supplier_id: Optional[uuid.UUID] = None
    unit_price: Optional[float] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None


class SupplierQuotePublic(SQLModel):
    id: uuid.UUID
    po_item_id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_name: Optional[str]
    unit_price: float
    lead_time_days: Optional[int]
    notes: Optional[str]
    is_selected: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# PurchaseOrderItem
# ---------------------------------------------------------------------------

class PurchaseOrderItemBase(SQLModel):
    item_name: str = Field(max_length=500)
    specifications: Optional[str] = Field(default=None, sa_type=Text())
    unit: str = Field(max_length=30)
    quantity: float


class PurchaseOrderItem(PurchaseOrderItemBase, table=True):
    __tablename__ = "purchaseorderitem"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    po_id: uuid.UUID = Field(foreign_key="purchaseorder.id", index=True)
    request_item_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="purchaserequestitem.id"
    )
    selected_supplier_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="supplier.id"
    )
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    received_quantity: float = 0.0

    po: Optional["PurchaseOrder"] = Relationship(back_populates="items")
    supplier_quotes: List[SupplierQuote] = Relationship(
        back_populates="po_item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class PurchaseOrderItemCreate(PurchaseOrderItemBase):
    request_item_id: Optional[uuid.UUID] = None


class PurchaseOrderItemPublic(PurchaseOrderItemBase):
    id: uuid.UUID
    po_id: uuid.UUID
    request_item_id: Optional[uuid.UUID]
    selected_supplier_id: Optional[uuid.UUID]
    unit_price: Optional[float]
    total_price: Optional[float]
    received_quantity: float
    supplier_quotes: List[SupplierQuotePublic] = []


# ---------------------------------------------------------------------------
# PurchaseOrder
# ---------------------------------------------------------------------------

class PurchaseOrderBase(SQLModel):
    notes: Optional[str] = Field(default=None, sa_type=Text())
    expected_delivery_date: Optional[date] = None


class PurchaseOrder(PurchaseOrderBase, table=True):
    __tablename__ = "purchaseorder"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    request_id: uuid.UUID = Field(foreign_key="purchaserequest.id", index=True)
    po_number: str = Field(max_length=30, index=True)
    status: str = Field(default="draft", max_length=30)
    # draft → pending_supplier_selection → approved → ordered → partially_received → received → cancelled
    created_by: uuid.UUID = Field(foreign_key="user.id")
    approved_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    approved_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    ordered_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    received_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    total_amount: Optional[float] = None
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    items: List[PurchaseOrderItem] = Relationship(
        back_populates="po",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    request: Optional["PurchaseRequest"] = Relationship(back_populates="purchase_orders")


class PurchaseOrderCreate(PurchaseOrderBase):
    items: List[PurchaseOrderItemCreate]


class PurchaseOrderPublic(PurchaseOrderBase):
    id: uuid.UUID
    company_id: uuid.UUID
    request_id: uuid.UUID
    po_number: str
    status: str
    status_label: Optional[str] = None
    created_by: uuid.UUID
    approved_by: Optional[uuid.UUID]
    approved_at: Optional[datetime]
    ordered_at: Optional[datetime]
    received_at: Optional[datetime]
    total_amount: Optional[float]
    created_at: datetime
    updated_at: datetime
    items: List[PurchaseOrderItemPublic] = []


class PurchaseOrdersPublic(SQLModel):
    data: List[PurchaseOrderPublic]
    count: int


# ---------------------------------------------------------------------------
# PurchaseRequest (root entity)
# ---------------------------------------------------------------------------

class PurchaseRequestBase(SQLModel):
    title: str = Field(max_length=500)
    urgency: str = Field(default="normal", max_length=20)
    # "normal" | "urgent" | "critical"
    notes: Optional[str] = Field(default=None, sa_type=Text())


class PurchaseRequest(PurchaseRequestBase, table=True):
    __tablename__ = "purchaserequest"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="project.id", index=True)
    contract_id: Optional[uuid.UUID] = Field(default=None, foreign_key="contract.id", index=True)
    request_number: str = Field(max_length=30, index=True)
    status: str = Field(default="draft", max_length=30)
    # draft → pending_tech → pending_director → approved → ordered → received → cancelled
    requested_by: uuid.UUID = Field(foreign_key="user.id")
    tech_reviewed_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    tech_reviewed_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    director_approved_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    director_approved_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    is_deleted: bool = False
    deleted_at: Optional[datetime] = Field(default=None, sa_type=DateTime())
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))

    items: List[PurchaseRequestItem] = Relationship(
        back_populates="request",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    purchase_orders: List[PurchaseOrder] = Relationship(
        back_populates="request",
        sa_relationship_kwargs={"cascade": "save-update, merge"},
    )


# ---------------------------------------------------------------------------
# PurchaseRequest Schemas
# ---------------------------------------------------------------------------

class PurchaseRequestCreate(PurchaseRequestBase):
    project_id: Optional[uuid.UUID] = None
    contract_id: Optional[uuid.UUID] = None
    items: List[PurchaseRequestItemCreate] = []


class PurchaseRequestUpdate(SQLModel):
    title: Optional[str] = None
    urgency: Optional[str] = None
    notes: Optional[str] = None


class PurchaseRequestPublic(PurchaseRequestBase):
    id: uuid.UUID
    company_id: uuid.UUID
    project_id: Optional[uuid.UUID]
    contract_id: Optional[uuid.UUID]
    request_number: str
    status: str
    status_label: Optional[str] = None
    requested_by: uuid.UUID
    tech_reviewed_by: Optional[uuid.UUID]
    tech_reviewed_at: Optional[datetime]
    director_approved_by: Optional[uuid.UUID]
    director_approved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[PurchaseRequestItemPublic] = []


class PurchaseRequestsPublic(SQLModel):
    data: List[PurchaseRequestPublic]
    count: int


# ---------------------------------------------------------------------------
# Workflow action schemas
# ---------------------------------------------------------------------------

class PRReviewRequest(SQLModel):
    action: str  # "approve" | "reject"
    note: Optional[str] = None


class POSelectSuppliersRequest(SQLModel):
    # List of {po_item_id, supplier_quote_id}
    selections: List[dict]


class POReceiveItemInput(SQLModel):
    po_item_id: uuid.UUID
    received_quantity: float


class POReceiveRequest(SQLModel):
    items: List[POReceiveItemInput]
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Status label maps
# ---------------------------------------------------------------------------

PR_STATUS_LABELS: dict[str, str] = {
    "draft": "Bản nháp",
    "pending_tech": "Chờ bộ phận Kỹ thuật duyệt",
    "pending_director": "Chờ BGĐ duyệt",
    "approved": "Đã duyệt",
    "ordered": "Đã đặt hàng",
    "received": "Đã nhận hàng",
    "cancelled": "Đã hủy",
}

PO_STATUS_LABELS: dict[str, str] = {
    "draft": "Bản nháp",
    "pending_supplier_selection": "Chờ chọn nhà cung cấp",
    "approved": "Đã duyệt NCC",
    "ordered": "Đã đặt hàng",
    "partially_received": "Nhận một phần",
    "received": "Đã nhận đủ",
    "cancelled": "Đã hủy",
}
