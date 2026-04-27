"""Procurement domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.procurement import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseRequest,
    PurchaseRequestItem,
    SupplierQuote,
)


class ProcurementRepository(BaseRepository[PurchaseRequest]):
    _PR_CREATE_FIELDS = {
        "title",
        "urgency",
        "notes",
        "company_id",
        "project_id",
        "contract_id",
        "request_number",
        "status",
        "requested_by",
        "tech_reviewed_by",
        "tech_reviewed_at",
        "director_approved_by",
        "director_approved_at",
    }
    _PO_CREATE_FIELDS = {
        "company_id",
        "request_id",
        "po_number",
        "status",
        "created_by",
        "approved_by",
        "approved_at",
        "ordered_at",
        "received_at",
        "total_amount",
        "notes",
        "expected_delivery_date",
    }

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(PurchaseRequest, session)

    # ------------------------------------------------------------------
    # Number generation
    # ------------------------------------------------------------------

    async def next_request_number(self, year: int) -> str:
        prefix = f"YC-{year}-"
        stmt = (
            select(func.count())
            .select_from(PurchaseRequest)
            .where(PurchaseRequest.request_number.like(f"{prefix}%"))  # type: ignore[attr-defined]
        )
        result = await self._execute(stmt)
        seq = (result.scalar_one() or 0) + 1
        return f"{prefix}{seq:03d}"

    async def next_po_number(self, year: int) -> str:
        prefix = f"PO-{year}-"
        stmt = (
            select(func.count())
            .select_from(PurchaseOrder)
            .where(PurchaseOrder.po_number.like(f"{prefix}%"))  # type: ignore[attr-defined]
        )
        result = await self._execute(stmt)
        seq = (result.scalar_one() or 0) + 1
        return f"{prefix}{seq:03d}"

    # ------------------------------------------------------------------
    # PurchaseRequest
    # ------------------------------------------------------------------

    async def get_request_or_404(self, request_id: uuid.UUID) -> PurchaseRequest:
        r = await self.get_by_id(request_id)
        if not r or r.is_deleted:
            raise HTTPException(status_code=404, detail="Purchase request not found")
        return r

    async def list_requests(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        project_id: uuid.UUID | None = None,
        urgency: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[PurchaseRequest], int]:
        base = select(PurchaseRequest).where(
            PurchaseRequest.company_id == company_id,
            PurchaseRequest.is_deleted == False,  # noqa: E712
        )
        if status:
            base = base.where(PurchaseRequest.status == status)
        if project_id:
            base = base.where(PurchaseRequest.project_id == project_id)
        if urgency:
            base = base.where(PurchaseRequest.urgency == urgency)

        count_result = await self._execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()
        result = await self._execute(
            base.order_by(PurchaseRequest.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
        )
        return result.scalars().all(), total

    async def get_request_items(self, request_id: uuid.UUID) -> Sequence[PurchaseRequestItem]:
        result = await self._execute(
            select(PurchaseRequestItem).where(PurchaseRequestItem.request_id == request_id)
        )
        return result.scalars().all()

    async def add_request_item(self, data: dict) -> PurchaseRequestItem:
        item = PurchaseRequestItem.model_validate(data)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def add_request(self, data: dict) -> PurchaseRequest:
        payload = {k: v for k, v in data.items() if k in self._PR_CREATE_FIELDS}
        request = PurchaseRequest(
            title=payload["title"],
            urgency=payload.get("urgency", "normal"),
            notes=payload.get("notes"),
            company_id=payload["company_id"],
            project_id=payload.get("project_id"),
            contract_id=payload.get("contract_id"),
            request_number=payload["request_number"],
            status=payload.get("status", "draft"),
            requested_by=payload["requested_by"],
            tech_reviewed_by=payload.get("tech_reviewed_by"),
            tech_reviewed_at=payload.get("tech_reviewed_at"),
            director_approved_by=payload.get("director_approved_by"),
            director_approved_at=payload.get("director_approved_at"),
        )
        self._session.add(request)
        await self._session.flush()
        await self._session.refresh(request)
        return request

    # ------------------------------------------------------------------
    # PurchaseOrder
    # ------------------------------------------------------------------

    async def get_po_or_404(self, po_id: uuid.UUID) -> PurchaseOrder:
        po = await self._session.get(PurchaseOrder, po_id)
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return po

    async def list_pos_for_request(self, request_id: uuid.UUID) -> Sequence[PurchaseOrder]:
        result = await self._execute(
            select(PurchaseOrder)
            .where(PurchaseOrder.request_id == request_id)
            .order_by(PurchaseOrder.created_at)
        )
        return result.scalars().all()

    async def list_all_pos(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[PurchaseOrder], int]:
        base = select(PurchaseOrder).where(PurchaseOrder.company_id == company_id)
        if status:
            base = base.where(PurchaseOrder.status == status)
        count_result = await self._execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()
        result = await self._execute(
            base.order_by(PurchaseOrder.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
        )
        return result.scalars().all(), total

    async def add_po(self, data: dict) -> PurchaseOrder:
        payload = {k: v for k, v in data.items() if k in self._PO_CREATE_FIELDS}
        po = PurchaseOrder(
            company_id=payload["company_id"],
            request_id=payload["request_id"],
            po_number=payload["po_number"],
            status=payload.get("status", "draft"),
            created_by=payload["created_by"],
            approved_by=payload.get("approved_by"),
            approved_at=payload.get("approved_at"),
            ordered_at=payload.get("ordered_at"),
            received_at=payload.get("received_at"),
            total_amount=payload.get("total_amount"),
            notes=payload.get("notes"),
            expected_delivery_date=payload.get("expected_delivery_date"),
        )
        self._session.add(po)
        await self._session.flush()
        await self._session.refresh(po)
        return po

    async def save_po(self, po: PurchaseOrder) -> PurchaseOrder:
        self._session.add(po)
        await self._session.flush()
        await self._session.refresh(po)
        return po

    async def get_po_items(self, po_id: uuid.UUID) -> Sequence[PurchaseOrderItem]:
        result = await self._execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.po_id == po_id)
        )
        return result.scalars().all()

    async def add_po_item(self, data: dict) -> PurchaseOrderItem:
        item = PurchaseOrderItem.model_validate(data)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def get_po_item_or_404(self, po_id: uuid.UUID, item_id: uuid.UUID) -> PurchaseOrderItem:
        result = await self._execute(
            select(PurchaseOrderItem).where(
                PurchaseOrderItem.id == item_id,
                PurchaseOrderItem.po_id == po_id,
            )
        )
        item = result.scalars().first()
        if not item:
            raise HTTPException(status_code=404, detail="PO item not found")
        return item

    async def save_po_item(self, item: PurchaseOrderItem) -> PurchaseOrderItem:
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    # ------------------------------------------------------------------
    # SupplierQuote
    # ------------------------------------------------------------------

    async def get_quotes_for_item(self, po_item_id: uuid.UUID) -> Sequence[SupplierQuote]:
        result = await self._execute(
            select(SupplierQuote).where(SupplierQuote.po_item_id == po_item_id)
        )
        return result.scalars().all()

    async def add_supplier_quote(self, data: dict) -> SupplierQuote:
        q = SupplierQuote.model_validate(data)
        self._session.add(q)
        await self._session.flush()
        await self._session.refresh(q)
        return q

    async def get_quote_or_404(self, quote_id: uuid.UUID) -> SupplierQuote:
        q = await self._session.get(SupplierQuote, quote_id)
        if not q:
            raise HTTPException(status_code=404, detail="Supplier quote not found")
        return q

    async def save_quote(self, q: SupplierQuote) -> SupplierQuote:
        self._session.add(q)
        await self._session.flush()
        await self._session.refresh(q)
        return q
