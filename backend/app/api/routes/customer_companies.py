"""Customer-company directory routes — tenant-scoped CRUD.

Manages the directory of customer companies ("công ty khách hàng") and the
tenant's own companies ("công ty của tôi") that quotations/contracts link to.
All rows are scoped to the caller's tenant (`current_user.company_id`).
Permissions reuse the quotation set since customers are part of the sales flow.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import AsyncSessionDep
from app.models.customer_company import (
    CUSTOMER_COMPANY_TYPES,
    CustomerCompaniesPublic,
    CustomerCompany,
    CustomerCompanyCreate,
    CustomerCompanyPublic,
    CustomerCompanyUpdate,
)
from app.models.user import User
from app.shared.permission import require_permission

router = APIRouter(prefix="/customer-companies", tags=["customer-companies"])


def _require_tenant(current_user: User) -> uuid.UUID:
    if current_user.company_id is None:
        raise HTTPException(400, "User is not attached to a company")
    return current_user.company_id


async def _get_owned_or_404(
    session: AsyncSessionDep, company_id: uuid.UUID, customer_id: uuid.UUID
) -> CustomerCompany:
    row = await session.get(CustomerCompany, customer_id)
    if row is None or row.is_deleted or row.company_id != company_id:
        raise HTTPException(404, "Customer company not found")
    return row


@router.post("", response_model=CustomerCompanyPublic, status_code=status.HTTP_201_CREATED)
async def create_customer_company(
    body: CustomerCompanyCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CUSTOMER_CREATE")),
) -> CustomerCompanyPublic:
    """Register a customer company (or own company) for the current tenant."""
    company_id = _require_tenant(current_user)
    if body.type not in CUSTOMER_COMPANY_TYPES:
        raise HTTPException(422, f"type must be one of {CUSTOMER_COMPANY_TYPES}")
    if not body.name.strip():
        raise HTTPException(422, "name is required")

    row = CustomerCompany(
        **body.model_dump(),
        company_id=company_id,
        created_by=current_user.id,
    )
    row.name = row.name.strip()
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return CustomerCompanyPublic.model_validate(row, from_attributes=True)


@router.get("", response_model=CustomerCompaniesPublic)
async def list_customer_companies(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CUSTOMER_VIEW")),
    type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    include_inactive: bool = Query(default=True),
) -> CustomerCompaniesPublic:
    """List customer companies for the tenant, filtered by type / name search."""
    company_id = _require_tenant(current_user)
    stmt = select(CustomerCompany).where(
        CustomerCompany.company_id == company_id,
        CustomerCompany.is_deleted == False,  # noqa: E712
    )
    if type:
        stmt = stmt.where(CustomerCompany.type == type)
    if not include_inactive:
        stmt = stmt.where(CustomerCompany.is_active == True)  # noqa: E712
    if q:
        stmt = stmt.where(CustomerCompany.name.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(func.lower(CustomerCompany.name))

    rows = (await session.execute(stmt)).scalars().all()
    data = [CustomerCompanyPublic.model_validate(r, from_attributes=True) for r in rows]
    return CustomerCompaniesPublic(data=data, count=len(data))


@router.get("/{customer_id}", response_model=CustomerCompanyPublic)
async def get_customer_company(
    customer_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CUSTOMER_VIEW")),
) -> CustomerCompanyPublic:
    """Get a single customer company (must belong to the tenant)."""
    company_id = _require_tenant(current_user)
    row = await _get_owned_or_404(session, company_id, customer_id)
    return CustomerCompanyPublic.model_validate(row, from_attributes=True)


@router.patch("/{customer_id}", response_model=CustomerCompanyPublic)
async def update_customer_company(
    customer_id: uuid.UUID,
    body: CustomerCompanyUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CUSTOMER_CREATE")),
) -> CustomerCompanyPublic:
    """Update info and/or site location of a customer company."""
    company_id = _require_tenant(current_user)
    row = await _get_owned_or_404(session, company_id, customer_id)

    data = body.model_dump(exclude_unset=True)
    if "type" in data and data["type"] not in CUSTOMER_COMPANY_TYPES:
        raise HTTPException(422, f"type must be one of {CUSTOMER_COMPANY_TYPES}")
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(422, "name cannot be empty")
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return CustomerCompanyPublic.model_validate(row, from_attributes=True)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_company(
    customer_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CUSTOMER_CREATE")),
) -> None:
    """Soft-delete a customer company."""
    company_id = _require_tenant(current_user)
    row = await _get_owned_or_404(session, company_id, customer_id)
    row.is_deleted = True
    row.is_active = False
    session.add(row)
    await session.flush()
