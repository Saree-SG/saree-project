"""Quotation domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.quotation import (
    Quotation,
    QuotationAttachment,
    QuotationLineItem,
    QuotationNegotiationLog,
    QuotationStageTransition,
    QuotationVersion,
)


class QuotationRepository(BaseRepository[Quotation]):
    """Async repository for Quotation and all sub-entities."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Quotation, session)

    # ------------------------------------------------------------------
    # Quote number generation
    # ------------------------------------------------------------------

    async def next_quote_number(self, year: int) -> str:
        """Generate next sequential quote number: BG-{year}-{seq:03d}."""
        prefix = f"BG-{year}-"
        stmt = (
            select(func.count())
            .select_from(Quotation)
            .where(Quotation.quote_number.like(f"{prefix}%"))  # type: ignore[attr-defined]
        )
        result = await self._execute(stmt)
        seq = (result.scalar_one() or 0) + 1
        return f"{prefix}{seq:03d}"

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    async def get_or_404(self, quotation_id: uuid.UUID) -> Quotation:
        """Load quotation or raise 404."""
        q = await self.get_by_id(quotation_id)
        if not q or q.is_deleted:
            raise HTTPException(status_code=404, detail="Quotation not found")
        return q

    async def get_by_quote_number(self, quote_number: str) -> Quotation | None:
        result = await self._execute(
            select(Quotation).where(Quotation.quote_number == quote_number)
        )
        return result.scalars().first()

    async def list_by_stages(
        self,
        company_id: uuid.UUID,
        stages: list[str],
    ) -> Sequence[Quotation]:
        """Return active (non-closed, non-deleted) quotations in the given stages."""
        result = await self._execute(
            select(Quotation)
            .where(
                Quotation.company_id == company_id,
                Quotation.is_deleted == False,  # noqa: E712
                Quotation.current_stage.in_(stages),  # type: ignore[attr-defined]
            )
            .order_by(Quotation.updated_at.desc())  # type: ignore[attr-defined]
        )
        return result.scalars().all()

    # ------------------------------------------------------------------
    # List with filters
    # ------------------------------------------------------------------

    async def list_with_filters(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        current_stage: str | None = None,
        outcome: str | None = None,
        equipment_category: str | None = None,
        client_company_name: str | None = None,
        sales_owner_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[Quotation], int]:
        """Return paginated quotations matching the given filters."""
        base = (
            select(Quotation)
            .where(
                Quotation.company_id == company_id,
                Quotation.is_deleted == False,  # noqa: E712
            )
        )

        if status:
            base = base.where(Quotation.status == status)
        if current_stage:
            base = base.where(Quotation.current_stage == current_stage)
        if outcome:
            base = base.where(Quotation.outcome == outcome)
        if equipment_category:
            base = base.where(
                Quotation.equipment_category.ilike(f"%{equipment_category}%")  # type: ignore[attr-defined]
            )
        if client_company_name:
            base = base.where(
                Quotation.client_company_name.ilike(f"%{client_company_name}%")  # type: ignore[attr-defined]
            )
        if sales_owner_id:
            base = base.where(Quotation.sales_owner_id == sales_owner_id)
        if date_from:
            base = base.where(Quotation.created_at >= date_from)  # type: ignore[arg-type]
        if date_to:
            base = base.where(Quotation.created_at <= date_to)  # type: ignore[arg-type]

        count_stmt = select(func.count()).select_from(base.subquery())
        count_result = await self._execute(count_stmt)
        total = count_result.scalar_one()

        data_stmt = (
            base.order_by(Quotation.created_at.desc())  # type: ignore[attr-defined]
            .offset(skip)
            .limit(limit)
        )
        data_result = await self._execute(data_stmt)
        rows = data_result.scalars().all()

        return rows, total

    # ------------------------------------------------------------------
    # Line items
    # ------------------------------------------------------------------

    async def get_line_items(
        self, quotation_id: uuid.UUID
    ) -> Sequence[QuotationLineItem]:
        result = await self._execute(
            select(QuotationLineItem)
            .where(QuotationLineItem.quotation_id == quotation_id)
            .order_by(QuotationLineItem.sort_order, QuotationLineItem.created_at)
        )
        return result.scalars().all()

    async def get_line_item_or_404(
        self, quotation_id: uuid.UUID, item_id: uuid.UUID
    ) -> QuotationLineItem:
        item = await self._session.get(QuotationLineItem, item_id)
        if not item or item.quotation_id != quotation_id:
            raise HTTPException(status_code=404, detail="Line item not found")
        return item

    async def add_line_item(self, data: dict) -> QuotationLineItem:
        item = QuotationLineItem(**data)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def save_line_item(self, item: QuotationLineItem) -> QuotationLineItem:
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete_line_item(self, item: QuotationLineItem) -> None:
        await self._session.delete(item)

    # ------------------------------------------------------------------
    # Stage transitions
    # ------------------------------------------------------------------

    async def get_transitions(
        self, quotation_id: uuid.UUID
    ) -> Sequence[QuotationStageTransition]:
        result = await self._execute(
            select(QuotationStageTransition)
            .where(QuotationStageTransition.quotation_id == quotation_id)
            .order_by(QuotationStageTransition.created_at)
        )
        return result.scalars().all()

    async def add_transition(self, data: dict) -> QuotationStageTransition:
        t = QuotationStageTransition(**data)
        self._session.add(t)
        await self._session.flush()
        await self._session.refresh(t)
        return t

    # ------------------------------------------------------------------
    # Negotiation logs
    # ------------------------------------------------------------------

    async def get_negotiations(
        self, quotation_id: uuid.UUID
    ) -> Sequence[QuotationNegotiationLog]:
        result = await self._execute(
            select(QuotationNegotiationLog)
            .where(QuotationNegotiationLog.quotation_id == quotation_id)
            .order_by(QuotationNegotiationLog.contact_date.desc())  # type: ignore[attr-defined]
        )
        return result.scalars().all()

    async def add_negotiation(self, data: dict) -> QuotationNegotiationLog:
        log = QuotationNegotiationLog(**data)
        self._session.add(log)
        await self._session.flush()
        await self._session.refresh(log)
        return log

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def get_attachments(
        self, quotation_id: uuid.UUID
    ) -> Sequence[QuotationAttachment]:
        result = await self._execute(
            select(QuotationAttachment)
            .where(QuotationAttachment.quotation_id == quotation_id)
            .order_by(QuotationAttachment.uploaded_at.desc())  # type: ignore[attr-defined]
        )
        return result.scalars().all()

    async def add_attachment(self, data: dict) -> QuotationAttachment:
        att = QuotationAttachment(**data)
        self._session.add(att)
        await self._session.flush()
        await self._session.refresh(att)
        return att

    async def get_attachment_or_404(
        self, quotation_id: uuid.UUID, att_id: uuid.UUID
    ) -> QuotationAttachment:
        att = await self._session.get(QuotationAttachment, att_id)
        if not att or att.quotation_id != quotation_id:
            raise HTTPException(status_code=404, detail="Attachment not found")
        return att

    async def delete_attachment(self, att: QuotationAttachment) -> None:
        await self._session.delete(att)

    # ------------------------------------------------------------------
    # Versions (snapshots)
    # ------------------------------------------------------------------

    async def get_versions(
        self, quotation_id: uuid.UUID
    ) -> Sequence[QuotationVersion]:
        result = await self._execute(
            select(QuotationVersion)
            .where(QuotationVersion.quotation_id == quotation_id)
            .order_by(QuotationVersion.version_number)
        )
        return result.scalars().all()

    async def get_version_or_404(
        self, quotation_id: uuid.UUID, version_id: uuid.UUID
    ) -> QuotationVersion:
        v = await self._session.get(QuotationVersion, version_id)
        if not v or v.quotation_id != quotation_id:
            raise HTTPException(status_code=404, detail="Version not found")
        return v

    async def add_version(self, data: dict) -> QuotationVersion:
        v = QuotationVersion(**data)
        self._session.add(v)
        await self._session.flush()
        await self._session.refresh(v)
        return v

    async def next_version_number(self, quotation_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(QuotationVersion)
            .where(QuotationVersion.quotation_id == quotation_id)
        )
        result = await self._execute(stmt)
        return (result.scalar_one() or 0) + 1

    # ------------------------------------------------------------------
    # Reports / Analytics
    # ------------------------------------------------------------------

    async def get_report_summary(
        self,
        company_id: uuid.UUID,
        date_from: date | None = None,
        date_to: date | None = None,
        equipment_category: str | None = None,
        client_company_name: str | None = None,
    ) -> dict:
        """Aggregate stats for the summary report."""
        base = select(Quotation).where(
            Quotation.company_id == company_id,
            Quotation.is_deleted == False,  # noqa: E712
        )
        if date_from:
            base = base.where(Quotation.created_at >= date_from)  # type: ignore[arg-type]
        if date_to:
            base = base.where(Quotation.created_at <= date_to)  # type: ignore[arg-type]
        if equipment_category:
            base = base.where(
                Quotation.equipment_category.ilike(f"%{equipment_category}%")  # type: ignore[attr-defined]
            )
        if client_company_name:
            base = base.where(
                Quotation.client_company_name.ilike(f"%{client_company_name}%")  # type: ignore[attr-defined]
            )

        result = await self._execute(base)
        rows = result.scalars().all()

        total = len(rows)
        closed_won = sum(1 for r in rows if r.outcome == "won")
        closed_lost = sum(1 for r in rows if r.outcome == "lost")
        sent = sum(1 for r in rows if r.status == "sent")
        negotiating = sum(1 for r in rows if r.status == "negotiating")
        in_progress = total - closed_won - closed_lost
        total_won_value = sum(
            r.total_sale_price for r in rows
            if r.outcome == "won" and r.total_sale_price is not None
        ) or None
        closed_total = closed_won + closed_lost
        win_rate = (closed_won / closed_total) if closed_total > 0 else None

        return {
            "total": total,
            "in_progress": in_progress,
            "sent": sent,
            "negotiating": negotiating,
            "closed_won": closed_won,
            "closed_lost": closed_lost,
            "win_rate": round(win_rate * 100, 1) if win_rate is not None else None,
            "total_won_value": total_won_value,
            "period_from": date_from,
            "period_to": date_to,
        }

    async def get_by_client_report(
        self,
        company_id: uuid.UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict]:
        """Group quotations by client company."""
        base = select(Quotation).where(
            Quotation.company_id == company_id,
            Quotation.is_deleted == False,  # noqa: E712
        )
        if date_from:
            base = base.where(Quotation.created_at >= date_from)  # type: ignore[arg-type]
        if date_to:
            base = base.where(Quotation.created_at <= date_to)  # type: ignore[arg-type]

        result = await self._execute(base)
        rows = result.scalars().all()

        grouped: dict[str, list[Quotation]] = {}
        for r in rows:
            grouped.setdefault(r.client_company_name, []).append(r)

        out = []
        for client, qs in sorted(grouped.items()):
            won = sum(1 for q in qs if q.outcome == "won")
            lost = sum(1 for q in qs if q.outcome == "lost")
            in_prog = len(qs) - won - lost
            closed = won + lost
            won_value = sum(
                q.total_sale_price for q in qs
                if q.outcome == "won" and q.total_sale_price is not None
            ) or None
            out.append({
                "client_company_name": client,
                "total": len(qs),
                "won": won,
                "lost": lost,
                "in_progress": in_prog,
                "win_rate": round(won / closed * 100, 1) if closed > 0 else None,
                "total_won_value": won_value,
            })
        return out

    async def get_by_equipment_report(
        self,
        company_id: uuid.UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict]:
        """Group quotations by equipment_category."""
        base = select(Quotation).where(
            Quotation.company_id == company_id,
            Quotation.is_deleted == False,  # noqa: E712
        )
        if date_from:
            base = base.where(Quotation.created_at >= date_from)  # type: ignore[arg-type]
        if date_to:
            base = base.where(Quotation.created_at <= date_to)  # type: ignore[arg-type]

        result = await self._execute(base)
        rows = result.scalars().all()

        grouped: dict[str, list[Quotation]] = {}
        for r in rows:
            cat = r.equipment_category or "Không phân loại"
            grouped.setdefault(cat, []).append(r)

        out = []
        for cat, qs in sorted(grouped.items()):
            won = sum(1 for q in qs if q.outcome == "won")
            lost = sum(1 for q in qs if q.outcome == "lost")
            closed = won + lost
            out.append({
                "equipment_category": cat,
                "total": len(qs),
                "won": won,
                "lost": lost,
                "win_rate": round(won / closed * 100, 1) if closed > 0 else None,
            })
        return out

    async def get_lost_reason_report(
        self,
        company_id: uuid.UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict]:
        """Break down lost quotations by reason category."""
        base = select(Quotation).where(
            Quotation.company_id == company_id,
            Quotation.is_deleted == False,  # noqa: E712
            Quotation.outcome == "lost",
        )
        if date_from:
            base = base.where(Quotation.created_at >= date_from)  # type: ignore[arg-type]
        if date_to:
            base = base.where(Quotation.created_at <= date_to)  # type: ignore[arg-type]

        result = await self._execute(base)
        rows = result.scalars().all()

        grouped: dict[str, int] = {}
        for r in rows:
            cat = r.lost_reason_category or "other"
            grouped[cat] = grouped.get(cat, 0) + 1

        total = len(rows)
        out = []
        for cat, count in sorted(grouped.items(), key=lambda x: -x[1]):
            out.append({
                "lost_reason_category": cat,
                "count": count,
                "percentage": round(count / total * 100, 1) if total > 0 else 0,
            })
        return out
