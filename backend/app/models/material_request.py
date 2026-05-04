"""Material Request models — 2-step approval workflow."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# DB Tables
# ---------------------------------------------------------------------------

class MaterialRequest(SQLModel, table=True):
    __tablename__ = "material_request"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    requester_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    task_id: Optional[uuid.UUID] = Field(default=None, foreign_key="task.id")

    item_name: str
    quantity: float
    unit: str = Field(default="cái")
    reason: str

    # pending_materials → pending_director → approved | rejected
    status: str = Field(default="pending_materials", index=True)

    # Step 1 — materials dept review
    materials_reviewer_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    materials_reviewed_at: Optional[datetime] = None
    materials_note: Optional[str] = None

    # Step 2 — director decision
    director_reviewer_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    director_reviewed_at: Optional[datetime] = None
    director_note: Optional[str] = None

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    attachments: List["MaterialRequestAttachment"] = Relationship(back_populates="request")


class MaterialRequestAttachment(SQLModel, table=True):
    __tablename__ = "material_request_attachment"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    request_id: uuid.UUID = Field(foreign_key="material_request.id", index=True)
    filename: str
    file_url: str
    uploaded_by: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=_now)

    request: Optional[MaterialRequest] = Relationship(back_populates="attachments")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MaterialRequestCreate(SQLModel):
    item_name: str
    quantity: float
    unit: str = "cái"
    reason: str
    task_id: Optional[uuid.UUID] = None


class MaterialRequestReview(SQLModel):
    """Used by phòng vật tư — step 1."""
    approved: bool
    note: Optional[str] = None


class MaterialRequestDecision(SQLModel):
    """Used by director — step 2."""
    approved: bool
    note: Optional[str] = None


class MaterialRequestAttachmentPublic(SQLModel):
    id: uuid.UUID
    filename: str
    file_url: str
    uploaded_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class MaterialRequestPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    requester_id: uuid.UUID
    task_id: Optional[uuid.UUID]
    item_name: str
    quantity: float
    unit: str
    reason: str
    status: str
    materials_reviewer_id: Optional[uuid.UUID]
    materials_reviewed_at: Optional[datetime]
    materials_note: Optional[str]
    director_reviewer_id: Optional[uuid.UUID]
    director_reviewed_at: Optional[datetime]
    director_note: Optional[str]
    created_at: datetime
    updated_at: datetime
    attachments: list[MaterialRequestAttachmentPublic] = []

    model_config = {"from_attributes": True}
