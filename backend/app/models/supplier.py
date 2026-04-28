"""
Supplier domain models.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

class SupplierBase(SQLModel):
    supplier_name: str = Field(max_length=255)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, sa_type=Text())
    specialty: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, sa_type=Text())
    rating: Optional[int] = Field(default=None, ge=1, le=5)


# ---------------------------------------------------------------------------
# Table
# ---------------------------------------------------------------------------

class Supplier(SupplierBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    created_by: uuid.UUID = Field(foreign_key="user.id")
    is_deleted: bool = False
    deleted_at: Optional[datetime] = Field(default=None, sa_type=DateTime())
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(SQLModel):
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    specialty: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class SupplierPublic(SupplierBase):
    id: uuid.UUID
    company_id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SuppliersPublic(SQLModel):
    data: List[SupplierPublic]
    count: int
