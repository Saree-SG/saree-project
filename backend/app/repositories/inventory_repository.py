from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Sequence

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import func, select

from app.models.inventory import (
    InventoryItem,
    MaterialIssueAttachment,
    MaterialIssue,
    MaterialIssueItem,
    StockMovement,
)


class InventoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # Sequence numbers
    # ------------------------------------------------------------------

    async def next_issue_number(self, year: int) -> str:
        result = await self.session.execute(
            select(func.count(MaterialIssue.id)).where(
                func.extract("year", MaterialIssue.created_at) == year
            )
        )
        seq = (result.scalar_one() or 0) + 1
        return f"XK-{year}-{seq:03d}"

    # ------------------------------------------------------------------
    # InventoryItem
    # ------------------------------------------------------------------

    async def get_item_or_404(self, item_id: uuid.UUID, company_id: uuid.UUID) -> InventoryItem:
        from fastapi import HTTPException, status

        result = await self.session.execute(
            select(InventoryItem).where(
                InventoryItem.id == item_id,
                InventoryItem.company_id == company_id,
                InventoryItem.is_deleted.is_(False),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        return item

    async def list_items(
        self,
        company_id: uuid.UUID,
        search: str | None = None,
        category: str | None = None,
        low_stock_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[InventoryItem], int]:
        q = select(InventoryItem).where(
            InventoryItem.company_id == company_id,
            InventoryItem.is_deleted.is_(False),
        )
        if search:
            q = q.where(InventoryItem.item_name.ilike(f"%{search}%"))
        if category:
            q = q.where(InventoryItem.category == category)
        if low_stock_only:
            q = q.where(InventoryItem.current_stock < InventoryItem.min_stock_alert)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        items = (
            await self.session.execute(q.order_by(InventoryItem.item_name).offset(skip).limit(limit))
        ).scalars().all()
        return items, total

    async def create_item(self, item: InventoryItem) -> InventoryItem:
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def update_item(self, item: InventoryItem) -> InventoryItem:
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def adjust_stock(
        self,
        item: InventoryItem,
        quantity_delta: Decimal,
        reference_type: str,
        reference_id: uuid.UUID | None,
        notes: str | None,
        handled_by: uuid.UUID,
        unit_price: Decimal | None = None,
    ) -> StockMovement:
        item.current_stock += quantity_delta
        item.updated_at = datetime.utcnow()
        movement_type = "in" if quantity_delta > 0 else "out"
        movement = StockMovement(
            company_id=item.company_id,
            item_id=item.id,
            movement_type=movement_type,
            quantity=abs(quantity_delta),
            unit_price=unit_price,
            reference_type=reference_type,
            reference_id=reference_id,
            notes=notes,
            handled_by=handled_by,
        )
        self.session.add(item)
        self.session.add(movement)
        await self.session.flush()
        await self.session.refresh(movement)
        return movement

    async def get_movements(
        self,
        item_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[StockMovement], int]:
        q = select(StockMovement).where(StockMovement.item_id == item_id)
        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        movements = (
            await self.session.execute(
                q.order_by(StockMovement.movement_date.desc()).offset(skip).limit(limit)
            )
        ).scalars().all()
        return movements, total

    # ------------------------------------------------------------------
    # MaterialIssue
    # ------------------------------------------------------------------

    async def get_issue_or_404(self, issue_id: uuid.UUID, company_id: uuid.UUID) -> MaterialIssue:
        from fastapi import HTTPException, status

        result = await self.session.execute(
            select(MaterialIssue).options(
                selectinload(MaterialIssue.items),
                selectinload(MaterialIssue.attachments),
            ).where(
                MaterialIssue.id == issue_id,
                MaterialIssue.company_id == company_id,
                MaterialIssue.is_deleted.is_(False),
            )
        )
        issue = result.scalar_one_or_none()
        if not issue:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material issue not found")
        await self.session.refresh(issue, ["items"])
        return issue

    async def list_issues(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        project_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[MaterialIssue], int]:
        q = select(MaterialIssue).options(
            selectinload(MaterialIssue.items),
            selectinload(MaterialIssue.attachments),
        ).where(
            MaterialIssue.company_id == company_id,
            MaterialIssue.is_deleted.is_(False),
        )
        if status:
            q = q.where(MaterialIssue.status == status)
        if project_id:
            q = q.where(MaterialIssue.project_id == project_id)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        issues = (
            await self.session.execute(
                q.order_by(MaterialIssue.created_at.desc()).offset(skip).limit(limit)
            )
        ).scalars().all()
        return issues, total

    async def create_issue(self, issue: MaterialIssue, items: list[MaterialIssueItem]) -> MaterialIssue:
        self.session.add(issue)
        await self.session.flush()
        for it in items:
            it.issue_id = issue.id
            self.session.add(it)
        await self.session.flush()
        await self.session.refresh(issue, ["items"])
        return issue

    async def save_issue(self, issue: MaterialIssue) -> MaterialIssue:
        self.session.add(issue)
        await self.session.flush()
        await self.session.refresh(issue, ["items"])
        return issue

    async def get_inventory_items_by_ids(
        self, item_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, dict]:
        if not item_ids:
            return {}
        result = await self.session.execute(
            select(InventoryItem).where(InventoryItem.id.in_(item_ids))
        )
        items = result.scalars().all()
        return {
            i.id: {
                "item_name": i.item_name,
                "item_code": i.item_code,
                "unit": i.unit,
                "current_stock": i.current_stock,
            }
            for i in items
        }

    async def add_issue_attachment(self, attachment: MaterialIssueAttachment) -> MaterialIssueAttachment:
        self.session.add(attachment)
        await self.session.flush()
        await self.session.refresh(attachment)
        return attachment
