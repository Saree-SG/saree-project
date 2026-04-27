"""Supplier domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.supplier import Supplier


class SupplierRepository(BaseRepository[Supplier]):

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Supplier, session)

    async def get_or_404(self, supplier_id: uuid.UUID) -> Supplier:
        s = await self.get_by_id(supplier_id)
        if not s or s.is_deleted:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return s

    async def list_with_filters(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None = None,
        specialty: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[Supplier], int]:
        base = (
            select(Supplier)
            .where(Supplier.company_id == company_id, Supplier.is_deleted == False)  # noqa: E712
        )
        if search:
            like = f"%{search}%"
            base = base.where(
                or_(
                    Supplier.supplier_name.ilike(like),  # type: ignore[union-attr]
                    Supplier.contact_name.ilike(like),  # type: ignore[union-attr]
                )
            )
        if specialty:
            base = base.where(Supplier.specialty.ilike(f"%{specialty}%"))  # type: ignore[union-attr]

        count_result = await self._execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()

        result = await self._execute(
            base.order_by(Supplier.supplier_name).offset(skip).limit(limit)
        )
        return result.scalars().all(), total
