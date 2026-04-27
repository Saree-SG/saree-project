import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


# ---------------------------------------------------------------------------
# Sub-entities (defined before root entities)
# ---------------------------------------------------------------------------

class StockMovement(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", nullable=False, index=True)
    item_id: uuid.UUID = Field(foreign_key="inventoryitem.id", nullable=False, index=True)
    movement_type: str = Field(max_length=10)  # "in" | "out"
    quantity: Decimal = Field(decimal_places=3, max_digits=12)
    unit_price: Optional[Decimal] = Field(default=None, decimal_places=2, max_digits=18)
    reference_type: str = Field(max_length=50)  # "po_receive" | "material_issue" | "manual_adjust"
    reference_id: Optional[uuid.UUID] = Field(default=None)  # polymorphic, no DB FK
    notes: Optional[str] = Field(default=None)
    movement_date: datetime = Field(default_factory=datetime.utcnow)
    handled_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")



class MaterialIssueItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    issue_id: uuid.UUID = Field(foreign_key="materialissue.id", nullable=False, index=True)
    inventory_item_id: uuid.UUID = Field(foreign_key="inventoryitem.id", nullable=False)
    quantity_requested: Decimal = Field(decimal_places=3, max_digits=12)
    quantity_issued: Optional[Decimal] = Field(default=None, decimal_places=3, max_digits=12)


class MaterialIssueAttachment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    issue_id: uuid.UUID = Field(foreign_key="materialissue.id", nullable=False, index=True)
    uploaded_by: uuid.UUID = Field(foreign_key="user.id")
    file_url: str = Field(max_length=1000)
    file_name: str = Field(max_length=500)
    file_type: str = Field(default="document", max_length=30)
    size_bytes: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)



# ---------------------------------------------------------------------------
# Root entities
# ---------------------------------------------------------------------------

class InventoryItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", nullable=False, index=True)
    item_name: str = Field(max_length=255)
    item_code: Optional[str] = Field(default=None, max_length=100)
    specifications: Optional[str] = Field(default=None)
    unit: str = Field(max_length=50)
    category: Optional[str] = Field(default=None, max_length=100)
    min_stock_alert: Decimal = Field(default=Decimal("0"), decimal_places=3, max_digits=12)
    current_stock: Decimal = Field(default=Decimal("0"), decimal_places=3, max_digits=12)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)



class MaterialIssue(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", nullable=False, index=True)
    project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="project.id")
    contract_id: Optional[uuid.UUID] = Field(default=None, foreign_key="contract.id")
    task_id: Optional[uuid.UUID] = Field(default=None, foreign_key="task.id", index=True)
    issue_number: str = Field(max_length=50, unique=True)
    requested_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    approved_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    issued_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    status: str = Field(default="pending", max_length=20)  # pending|approved|issued|cancelled
    notes: Optional[str] = Field(default=None)
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    items: List[MaterialIssueItem] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    attachments: List[MaterialIssueAttachment] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StockMovementPublic(SQLModel):
    id: uuid.UUID
    item_id: uuid.UUID
    movement_type: str
    quantity: Decimal
    unit_price: Optional[Decimal]
    reference_type: str
    reference_id: Optional[uuid.UUID]
    notes: Optional[str]
    movement_date: datetime
    handled_by: Optional[uuid.UUID]


class InventoryItemCreate(SQLModel):
    item_name: str
    item_code: Optional[str] = None
    specifications: Optional[str] = None
    unit: str
    category: Optional[str] = None
    min_stock_alert: Decimal = Decimal("0")


class InventoryItemUpdate(SQLModel):
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    specifications: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    min_stock_alert: Optional[Decimal] = None


class InventoryItemPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    item_name: str
    item_code: Optional[str]
    specifications: Optional[str]
    unit: str
    category: Optional[str]
    min_stock_alert: Decimal
    current_stock: Decimal
    created_at: datetime
    updated_at: datetime


class InventoryItemsPublic(SQLModel):
    data: list[InventoryItemPublic]
    count: int


class StockAdjustRequest(SQLModel):
    quantity: Decimal  # positive = in, negative = out
    notes: Optional[str] = None


class MaterialIssueItemCreate(SQLModel):
    inventory_item_id: uuid.UUID
    quantity_requested: Decimal


class MaterialIssueItemPublic(SQLModel):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[Decimal] = None
    quantity_requested: Decimal
    quantity_issued: Optional[Decimal]


class MaterialIssueAttachmentPublic(SQLModel):
    id: uuid.UUID
    issue_id: uuid.UUID
    uploaded_by: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    size_bytes: int
    created_at: datetime


class MaterialIssueCreate(SQLModel):
    project_id: Optional[uuid.UUID] = None
    contract_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    items: list[MaterialIssueItemCreate]


class MaterialIssuePublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    project_id: Optional[uuid.UUID]
    contract_id: Optional[uuid.UUID]
    task_id: Optional[uuid.UUID] = None
    issue_number: str
    requested_by: Optional[uuid.UUID]
    approved_by: Optional[uuid.UUID]
    issued_by: Optional[uuid.UUID]
    status: str
    notes: Optional[str]
    items: list[MaterialIssueItemPublic]
    attachments: list[MaterialIssueAttachmentPublic] = []
    created_at: datetime
    updated_at: datetime


class MaterialIssuesPublic(SQLModel):
    data: list[MaterialIssuePublic]
    count: int


class IssueApproveRequest(SQLModel):
    action: str  # "approve" | "reject"
    note: Optional[str] = None


class IssueExecuteRequest(SQLModel):
    quantities: Optional[dict[str, Decimal]] = None  # {item_id: qty_issued}
    notes: Optional[str] = None


class LinkedEntityCreate(SQLModel):
    """Body for POST /tasks/{task_id}/linked-entity."""
    entity_type: str | None = None
    items: list[MaterialIssueItemCreate] = []
