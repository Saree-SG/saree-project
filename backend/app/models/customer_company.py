"""
CustomerCompany — directory of business partners (customer companies and the
tenant's own companies) belonging to a tenant Company.

Unlike `Company` (the multi-tenant root, see app/models/org.py), a
CustomerCompany is a record *inside* a tenant: a customer ("công ty khách hàng")
that quotations/contracts are made for, or one of the tenant's own offices
("công ty của tôi"). It carries contact info and an optional site location.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# customer = công ty khách hàng, own = công ty của tôi
CUSTOMER_COMPANY_TYPES = ("customer", "own")


class CustomerCompanyBase(SQLModel):
    name: str = Field(max_length=255, index=True)
    type: str = Field(default="customer", max_length=20)  # customer | own
    tax_code: Optional[str] = Field(default=None, max_length=50)  # mã số thuế
    contact_name: Optional[str] = Field(default=None, max_length=255)
    contact_title: Optional[str] = Field(default=None, max_length=100)
    contact_phone: Optional[str] = Field(default=None, max_length=50)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, sa_type=Text)
    notes: Optional[str] = Field(default=None, sa_type=Text)
    # Site location (reference / future check-in-at-customer-site).
    site_lat: Optional[float] = None
    site_lng: Optional[float] = None
    site_radius_m: int = Field(default=150)


class CustomerCompany(CustomerCompanyBase, table=True):
    __tablename__ = "customercompany"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)  # tenant owner
    is_active: bool = True
    is_deleted: bool = False
    created_by: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CustomerCompanyCreate(CustomerCompanyBase):
    pass


class CustomerCompanyUpdate(SQLModel):
    name: Optional[str] = Field(default=None, max_length=255)
    type: Optional[str] = Field(default=None, max_length=20)
    tax_code: Optional[str] = Field(default=None, max_length=50)
    contact_name: Optional[str] = None
    contact_title: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    site_lat: Optional[float] = None
    site_lng: Optional[float] = None
    site_radius_m: Optional[int] = None
    is_active: Optional[bool] = None


class CustomerCompanyPublic(CustomerCompanyBase):
    id: uuid.UUID
    company_id: uuid.UUID
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CustomerCompaniesPublic(SQLModel):
    data: List[CustomerCompanyPublic]
    count: int
