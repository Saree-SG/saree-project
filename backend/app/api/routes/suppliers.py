"""Supplier management routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep
from app.models.supplier import SupplierCreate, SupplierPublic, SuppliersPublic, SupplierUpdate
from app.models.user import User
from app.services.supplier_service import SupplierService
from app.shared.permission import require_any_permission, require_permission

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _svc(session: AsyncSession) -> SupplierService:
    return SupplierService(session)


@router.get("/", response_model=SuppliersPublic)
async def list_suppliers(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("SUPPLIER_VIEW")),
    search: str | None = Query(default=None),
    specialty: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> SuppliersPublic:
    return await _svc(session).list_suppliers(
        current_user.company_id,
        search=search,
        specialty=specialty,
        skip=skip,
        limit=limit,
    )


@router.post("/", response_model=SupplierPublic, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("SUPPLIER_CREATE")),
) -> SupplierPublic:
    return await _svc(session).create_supplier(body, current_user)


@router.get("/{supplier_id}", response_model=SupplierPublic)
async def get_supplier(
    supplier_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("SUPPLIER_VIEW")),
) -> SupplierPublic:
    return await _svc(session).get_supplier(supplier_id, current_user.company_id)


@router.patch("/{supplier_id}", response_model=SupplierPublic)
async def update_supplier(
    supplier_id: uuid.UUID,
    body: SupplierUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("SUPPLIER_UPDATE")),
) -> SupplierPublic:
    return await _svc(session).update_supplier(supplier_id, body, current_user)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("SUPPLIER_DELETE")),
) -> None:
    await _svc(session).delete_supplier(supplier_id, current_user)
