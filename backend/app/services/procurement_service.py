"""Procurement service — business logic."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryItem, StockMovement
from app.models.notification import Notification
from app.models.procurement import (
    PO_STATUS_LABELS,
    PR_STATUS_LABELS,
    POReceiveRequest,
    POSelectSuppliersRequest,
    PRReviewRequest,
    PurchaseOrder,
    PurchaseOrderCreate,
    PurchaseOrderItemPublic,
    PurchaseOrderPublic,
    PurchaseOrdersPublic,
    PurchaseRequest,
    PurchaseRequestCreate,
    PurchaseRequestItemCreate,
    PurchaseRequestPublic,
    PurchaseRequestItemPublic,
    PurchaseRequestsPublic,
    PurchaseRequestUpdate,
    SupplierQuoteCreate,
    SupplierQuotePublic,
    SupplierQuoteUpdate,
)
from app.models.user import User
from app.repositories.procurement_repository import ProcurementRepository
from app.repositories.supplier_repository import SupplierRepository


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProcurementService:

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = ProcurementRepository(session)
        self._supplier_repo = SupplierRepository(session)

    # ------------------------------------------------------------------
    # PurchaseRequest — CRUD
    # ------------------------------------------------------------------

    async def list_requests(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        project_id: uuid.UUID | None = None,
        urgency: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> PurchaseRequestsPublic:
        items, total = await self._repo.list_requests(
            company_id, status=status, project_id=project_id, urgency=urgency,
            skip=skip, limit=limit,
        )
        return PurchaseRequestsPublic(
            data=[await self._enrich_request(r) for r in items],
            count=total,
        )

    async def get_request(self, request_id: uuid.UUID, company_id: uuid.UUID) -> PurchaseRequestPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, company_id)
        return await self._enrich_request(r)

    async def create_request(
        self, body: PurchaseRequestCreate, current_user: User
    ) -> PurchaseRequestPublic:
        year = _utcnow().year
        request_number = await self._repo.next_request_number(year)

        r = await self._repo.add_request({
            **body.model_dump(exclude={"items"}),
            "company_id": current_user.company_id,
            "requested_by": current_user.id,
            "request_number": request_number,
            "status": "draft",
        })

        for item_data in body.items:
            await self._repo.add_request_item({
                **item_data.model_dump(),
                "request_id": r.id,
            })

        return await self._enrich_request(r)

    async def update_request(
        self, request_id: uuid.UUID, body: PurchaseRequestUpdate, current_user: User
    ) -> PurchaseRequestPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "draft":
            raise HTTPException(status_code=400, detail="Chỉ có thể sửa yêu cầu ở trạng thái draft")
        patch = body.model_dump(exclude_unset=True)
        for k, v in patch.items():
            setattr(r, k, v)
        r.updated_at = _utcnow()
        await self._repo.save(r)
        return await self._enrich_request(r)

    async def add_request_item(
        self,
        request_id: uuid.UUID,
        body: PurchaseRequestItemCreate,
        current_user: User,
    ) -> PurchaseRequestPublic:
        """Add one material item to a draft purchase request."""
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "draft":
            raise HTTPException(status_code=400, detail="Chỉ có thể thêm vật tư khi yêu cầu ở trạng thái draft")
        await self._repo.add_request_item({
            **body.model_dump(),
            "request_id": r.id,
        })
        r.updated_at = _utcnow()
        await self._repo.save(r)
        return await self._enrich_request(r)

    async def delete_request(self, request_id: uuid.UUID, current_user: User) -> None:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status not in ("draft", "cancelled"):
            raise HTTPException(status_code=400, detail="Chỉ có thể xóa yêu cầu ở trạng thái draft")
        r.is_deleted = True
        r.deleted_at = _utcnow()
        await self._repo.save(r)

    # ------------------------------------------------------------------
    # PurchaseRequest — Workflow
    # ------------------------------------------------------------------

    async def submit_request(
        self, request_id: uuid.UUID, current_user: User, *, note: str | None = None
    ) -> PurchaseRequestPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "draft":
            raise HTTPException(status_code=400, detail="Chỉ có thể nộp yêu cầu ở trạng thái draft")
        items = await self._repo.get_request_items(request_id)
        if not items:
            raise HTTPException(status_code=422, detail="Yêu cầu phải có ít nhất 1 hạng mục vật tư")
        r.status = "pending_tech"
        r.updated_at = _utcnow()
        await self._repo.save(r)
        return await self._enrich_request(r)

    async def tech_review(
        self, request_id: uuid.UUID, body: PRReviewRequest, current_user: User
    ) -> PurchaseRequestPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "pending_tech":
            raise HTTPException(status_code=400, detail="Yêu cầu không ở trạng thái chờ kỹ thuật duyệt")
        if body.action == "approve":
            r.status = "pending_director"
            r.tech_reviewed_by = current_user.id
            r.tech_reviewed_at = _utcnow()
        elif body.action == "reject":
            r.status = "draft"
        else:
            raise HTTPException(status_code=400, detail="action phải là 'approve' hoặc 'reject'")
        r.updated_at = _utcnow()
        await self._repo.save(r)
        # Notify requester
        await self._notify(r.requested_by, "pr_tech_reviewed",
            f"[{r.request_number}] Kỹ thuật đã {'duyệt' if body.action == 'approve' else 'từ chối'}",
            body.note or "", r.id)
        return await self._enrich_request(r)

    async def director_approve(
        self, request_id: uuid.UUID, body: PRReviewRequest, current_user: User
    ) -> PurchaseRequestPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "pending_director":
            raise HTTPException(status_code=400, detail="Yêu cầu không ở trạng thái chờ BGĐ duyệt")
        if body.action == "approve":
            r.status = "approved"
            r.director_approved_by = current_user.id
            r.director_approved_at = _utcnow()
        elif body.action == "reject":
            r.status = "draft"
        else:
            raise HTTPException(status_code=400, detail="action phải là 'approve' hoặc 'reject'")
        r.updated_at = _utcnow()
        await self._repo.save(r)
        await self._notify(r.requested_by, "pr_director_approved",
            f"[{r.request_number}] BGĐ đã {'duyệt' if body.action == 'approve' else 'từ chối'}",
            body.note or "", r.id)
        return await self._enrich_request(r)

    # ------------------------------------------------------------------
    # PurchaseOrder — CRUD
    # ------------------------------------------------------------------

    async def list_pos_for_request(
        self, request_id: uuid.UUID, company_id: uuid.UUID
    ) -> PurchaseOrdersPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, company_id)
        pos = await self._repo.list_pos_for_request(request_id)
        return PurchaseOrdersPublic(
            data=[await self._enrich_po(po) for po in pos],
            count=len(pos),
        )

    async def list_all_pos(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> PurchaseOrdersPublic:
        pos, total = await self._repo.list_all_pos(company_id, status=status, skip=skip, limit=limit)
        return PurchaseOrdersPublic(
            data=[await self._enrich_po(po) for po in pos],
            count=total,
        )

    async def get_po(self, po_id: uuid.UUID, company_id: uuid.UUID) -> PurchaseOrderPublic:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, company_id)
        return await self._enrich_po(po)

    async def create_po(
        self, request_id: uuid.UUID, body: PurchaseOrderCreate, current_user: User
    ) -> PurchaseOrderPublic:
        r = await self._repo.get_request_or_404(request_id)
        _assert_company_pr(r, current_user.company_id)
        if r.status != "approved":
            raise HTTPException(
                status_code=400,
                detail="Chỉ có thể tạo đơn đặt hàng khi yêu cầu đã được BGĐ duyệt",
            )
        year = _utcnow().year
        po_number = await self._repo.next_po_number(year)
        body_data = body.model_dump()
        body_items = body_data.get("items") or []
        po = await self._repo.add_po({
            "notes": body_data.get("notes"),
            "expected_delivery_date": body_data.get("expected_delivery_date"),
            "company_id": current_user.company_id,
            "request_id": request_id,
            "po_number": po_number,
            "status": "draft",
            "created_by": current_user.id,
        })
        for item_data in body_items:
            await self._repo.add_po_item({
                **item_data,
                "po_id": po.id,
            })
        return await self._enrich_po(po)

    # ------------------------------------------------------------------
    # SupplierQuotes
    # ------------------------------------------------------------------

    async def add_quotes_to_item(
        self,
        po_id: uuid.UUID,
        item_id: uuid.UUID,
        quotes: list[SupplierQuoteCreate],
        current_user: User,
    ) -> list[SupplierQuotePublic]:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, current_user.company_id)
        item = await self._repo.get_po_item_or_404(po_id, item_id)

        existing = await self._repo.get_quotes_for_item(item_id)
        if len(existing) + len(quotes) > 3:
            raise HTTPException(status_code=400, detail="Mỗi hạng mục tối đa 3 báo giá nhà cung cấp")

        result = []
        for q in quotes:
            supplier = await self._supplier_repo.get_or_404(q.supplier_id)
            new_q = await self._repo.add_supplier_quote({
                **q.model_dump(),
                "po_item_id": item_id,
                "supplier_name": supplier.supplier_name,
            })
            result.append(SupplierQuotePublic.model_validate(new_q))

        # Move PO to pending_supplier_selection only when ALL items have at least 1 quote
        if po.status == "draft":
            all_items = await self._repo.get_po_items(po.id)
            all_have_quotes = True
            for pi in all_items:
                item_quotes = await self._repo.get_quotes_for_item(pi.id)
                if len(item_quotes) == 0:
                    all_have_quotes = False
                    break
            if all_have_quotes:
                po.status = "pending_supplier_selection"
                po.updated_at = _utcnow()
                await self._repo.save_po(po)

        return result

    async def update_quote_for_item(
        self,
        po_id: uuid.UUID,
        item_id: uuid.UUID,
        quote_id: uuid.UUID,
        body: SupplierQuoteUpdate,
        current_user: User,
    ) -> SupplierQuotePublic:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, current_user.company_id)
        if po.status not in ("draft", "pending_supplier_selection"):
            raise HTTPException(status_code=400, detail="Chỉ có thể sửa báo giá khi PO đang nhập báo giá")

        await self._repo.get_po_item_or_404(po_id, item_id)
        quote = await self._repo.get_quote_or_404(quote_id)
        if quote.po_item_id != item_id:
            raise HTTPException(status_code=400, detail="Báo giá không thuộc hạng mục này")

        patch = body.model_dump(exclude_unset=True)
        if "supplier_id" in patch and patch["supplier_id"] is not None:
            supplier = await self._supplier_repo.get_or_404(patch["supplier_id"])
            quote.supplier_id = supplier.id
            quote.supplier_name = supplier.supplier_name
        if "unit_price" in patch and patch["unit_price"] is not None:
            quote.unit_price = patch["unit_price"]
        if "lead_time_days" in patch:
            quote.lead_time_days = patch["lead_time_days"]
        if "notes" in patch:
            quote.notes = patch["notes"]
        await self._repo.save_quote(quote)
        return SupplierQuotePublic.model_validate(quote)

    async def select_suppliers(
        self, po_id: uuid.UUID, body: POSelectSuppliersRequest, current_user: User
    ) -> PurchaseOrderPublic:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, current_user.company_id)
        if po.status not in ("pending_supplier_selection",):
            raise HTTPException(status_code=400, detail="PO phải ở trạng thái chờ chọn nhà cung cấp")

        total_amount = 0.0
        for sel in body.selections:
            po_item_id = uuid.UUID(str(sel["po_item_id"]))
            quote_id = uuid.UUID(str(sel["supplier_quote_id"]))
            item = await self._repo.get_po_item_or_404(po_id, po_item_id)
            quote = await self._repo.get_quote_or_404(quote_id)
            if quote.po_item_id != po_item_id:
                raise HTTPException(status_code=400, detail="Quote không thuộc item này")

            # Deselect all quotes for this item then select chosen
            all_quotes = await self._repo.get_quotes_for_item(po_item_id)
            for q in all_quotes:
                q.is_selected = (q.id == quote_id)
                await self._repo.save_quote(q)

            item.selected_supplier_id = quote.supplier_id
            item.unit_price = quote.unit_price
            item.total_price = round(item.quantity * quote.unit_price, 2)
            await self._repo.save_po_item(item)
            total_amount += item.total_price or 0

        po.status = "approved"
        po.approved_by = current_user.id
        po.approved_at = _utcnow()
        po.total_amount = round(total_amount, 2)
        po.updated_at = _utcnow()
        await self._repo.save_po(po)
        return await self._enrich_po(po)

    async def mark_ordered(self, po_id: uuid.UUID, current_user: User) -> PurchaseOrderPublic:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, current_user.company_id)
        if po.status != "approved":
            raise HTTPException(status_code=400, detail="PO phải ở trạng thái đã duyệt NCC")
        po.status = "ordered"
        po.ordered_at = _utcnow()
        po.updated_at = _utcnow()
        await self._repo.save_po(po)
        # Update request status
        r = await self._repo.get_request_or_404(po.request_id)
        if r.status == "approved":
            r.status = "ordered"
            r.updated_at = _utcnow()
            await self._repo.save(r)
        return await self._enrich_po(po)

    async def receive_po(
        self, po_id: uuid.UUID, body: POReceiveRequest, current_user: User
    ) -> PurchaseOrderPublic:
        po = await self._repo.get_po_or_404(po_id)
        _assert_company_po(po, current_user.company_id)
        if po.status not in ("ordered", "partially_received"):
            raise HTTPException(status_code=400, detail="PO phải ở trạng thái đã đặt hàng")

        all_items = await self._repo.get_po_items(po_id)
        item_map = {i.id: i for i in all_items}

        for recv in body.items:
            item = item_map.get(recv.po_item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"PO item {recv.po_item_id} không tìm thấy")
            if recv.received_quantity <= 0:
                continue
            prev_received = item.received_quantity
            item.received_quantity = min(
                item.received_quantity + recv.received_quantity,
                item.quantity
            )
            await self._repo.save_po_item(item)
            received_delta = item.received_quantity - prev_received
            if received_delta > 0:
                await self._receive_into_inventory(
                    company_id=current_user.company_id,
                    po_id=po.id,
                    po_item=item,
                    quantity=Decimal(str(received_delta)),
                    handled_by=current_user.id,
                )

        # Determine new status
        all_received = all(i.received_quantity >= i.quantity for i in all_items)
        po.status = "received" if all_received else "partially_received"
        if all_received:
            po.received_at = _utcnow()
        po.updated_at = _utcnow()
        await self._repo.save_po(po)

        # Update request status
        if all_received:
            r = await self._repo.get_request_or_404(po.request_id)
            r.status = "received"
            r.updated_at = _utcnow()
            await self._repo.save(r)

        return await self._enrich_po(po)

    async def _receive_into_inventory(
        self,
        company_id: uuid.UUID | None,
        po_id: uuid.UUID,
        po_item,
        quantity: Decimal,
        handled_by: uuid.UUID,
    ) -> None:
        """Increase inventory and create a stock movement for PO receiving."""
        if company_id is None or quantity <= 0:
            return

        result = await self._session.execute(
            select(InventoryItem).where(
                InventoryItem.company_id == company_id,
                InventoryItem.item_name == po_item.item_name,
                InventoryItem.specifications == po_item.specifications,
                InventoryItem.unit == po_item.unit,
                InventoryItem.is_deleted == False,  # noqa: E712
            )
        )
        inv_item = result.scalars().first()
        if inv_item is None:
            inv_item = InventoryItem(
                company_id=company_id,
                item_name=po_item.item_name,
                specifications=po_item.specifications,
                unit=po_item.unit,
                category="procurement",
                created_by=handled_by,
                min_stock_alert=Decimal("0"),
                current_stock=Decimal("0"),
            )
            self._session.add(inv_item)
            await self._session.flush()

        inv_item.current_stock = Decimal(str(inv_item.current_stock)) + quantity
        inv_item.updated_at = datetime.utcnow()
        movement = StockMovement(
            company_id=company_id,
            item_id=inv_item.id,
            movement_type="in",
            quantity=quantity,
            unit_price=Decimal(str(po_item.unit_price)) if po_item.unit_price is not None else None,
            reference_type="po_receive",
            reference_id=po_id,
            notes=f"Nhập từ PO item: {po_item.item_name}",
            handled_by=handled_by,
        )
        self._session.add(inv_item)
        self._session.add(movement)
        await self._session.flush()

    # ------------------------------------------------------------------
    # Enrichment helpers
    # ------------------------------------------------------------------

    def _request_to_public_base(self, r: PurchaseRequest) -> PurchaseRequestPublic:
        """Map PurchaseRequest ORM row to response model without touching lazy relationships."""
        return PurchaseRequestPublic(
            title=r.title,
            urgency=r.urgency,
            notes=r.notes,
            id=r.id,
            company_id=r.company_id,
            project_id=r.project_id,
            contract_id=r.contract_id,
            request_number=r.request_number,
            status=r.status,
            status_label=PR_STATUS_LABELS.get(r.status),
            requested_by=r.requested_by,
            tech_reviewed_by=r.tech_reviewed_by,
            tech_reviewed_at=r.tech_reviewed_at,
            director_approved_by=r.director_approved_by,
            director_approved_at=r.director_approved_at,
            created_at=r.created_at,
            updated_at=r.updated_at,
            items=[],
        )

    def _po_to_public_base(self, po: PurchaseOrder) -> PurchaseOrderPublic:
        """Map PurchaseOrder ORM row to response model without touching lazy relationships."""
        return PurchaseOrderPublic(
            notes=po.notes,
            expected_delivery_date=po.expected_delivery_date,
            id=po.id,
            company_id=po.company_id,
            request_id=po.request_id,
            po_number=po.po_number,
            status=po.status,
            status_label=PO_STATUS_LABELS.get(po.status),
            created_by=po.created_by,
            approved_by=po.approved_by,
            approved_at=po.approved_at,
            ordered_at=po.ordered_at,
            received_at=po.received_at,
            total_amount=po.total_amount,
            created_at=po.created_at,
            updated_at=po.updated_at,
            items=[],
        )

    async def _enrich_request(self, r: PurchaseRequest) -> PurchaseRequestPublic:
        items = await self._repo.get_request_items(r.id)
        pub = self._request_to_public_base(r)
        pub.items = [PurchaseRequestItemPublic.model_validate(i) for i in items]
        return pub

    async def _enrich_po(self, po: PurchaseOrder) -> PurchaseOrderPublic:
        po_items = await self._repo.get_po_items(po.id)
        item_pubs = []
        for item in po_items:
            quotes = await self._repo.get_quotes_for_item(item.id)
            item_data = item.model_dump(exclude={"supplier_quotes"})
            item_pub = PurchaseOrderItemPublic.model_validate(item_data)
            item_pub.supplier_quotes = [SupplierQuotePublic.model_validate(q) for q in quotes]
            item_pubs.append(item_pub)
        pub = self._po_to_public_base(po)
        pub.items = item_pubs
        return pub

    async def _notify(
        self, user_id: uuid.UUID, notif_type: str,
        title: str, body: str, entity_id: uuid.UUID,
    ) -> None:
        notif = Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            body=body,
            entity_type="purchase_request",
            entity_id=entity_id,
        )
        self._session.add(notif)
        await self._session.flush()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assert_company_pr(r: PurchaseRequest, company_id: uuid.UUID | None) -> None:
    if r.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _assert_company_po(po: PurchaseOrder, company_id: uuid.UUID | None) -> None:
    if po.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")
