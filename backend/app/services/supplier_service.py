"""Supplier service — business logic layer."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import (
    Supplier,
    SupplierCreate,
    SupplierPublic,
    SuppliersPublic,
    SupplierUpdate,
)
from app.models.user import User
from app.repositories.supplier_repository import SupplierRepository


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SupplierService:

    def __init__(self, session: AsyncSession) -> None:
        self._repo = SupplierRepository(session)

    async def list_suppliers(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None = None,
        specialty: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> SuppliersPublic:
        items, total = await self._repo.list_with_filters(
            company_id, search=search, specialty=specialty, skip=skip, limit=limit
        )
        return SuppliersPublic(data=[SupplierPublic.model_validate(s) for s in items], count=total)

    async def get_supplier(self, supplier_id: uuid.UUID, company_id: uuid.UUID) -> SupplierPublic:
        s = await self._repo.get_or_404(supplier_id)
        _assert_same_company(s, company_id)
        return SupplierPublic.model_validate(s)

    async def create_supplier(self, body: SupplierCreate, current_user: User) -> SupplierPublic:
        s = await self._repo.add({
            **body.model_dump(),
            "company_id": current_user.company_id,
            "created_by": current_user.id,
        })
        return SupplierPublic.model_validate(s)

    async def update_supplier(
        self, supplier_id: uuid.UUID, body: SupplierUpdate, current_user: User
    ) -> SupplierPublic:
        s = await self._repo.get_or_404(supplier_id)
        _assert_same_company(s, current_user.company_id)
        patch = body.model_dump(exclude_unset=True)
        for k, v in patch.items():
            setattr(s, k, v)
        s.updated_at = _utcnow()
        await self._repo.save(s)
        return SupplierPublic.model_validate(s)

    async def delete_supplier(self, supplier_id: uuid.UUID, current_user: User) -> None:
        s = await self._repo.get_or_404(supplier_id)
        _assert_same_company(s, current_user.company_id)
        s.is_deleted = True
        s.deleted_at = _utcnow()
        await self._repo.save(s)


def _assert_same_company(supplier: Supplier, company_id: uuid.UUID | None) -> None:
    if supplier.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")
