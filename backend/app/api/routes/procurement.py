"""Procurement management routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep
from app.models.procurement import (
    POReceiveRequest,
    POSelectSuppliersRequest,
    PRReviewRequest,
    PurchaseOrderCreate,
    PurchaseOrderPublic,
    PurchaseOrdersPublic,
    PurchaseRequestCreate,
    PurchaseRequestItemCreate,
    PurchaseRequestPublic,
    PurchaseRequestsPublic,
    PurchaseRequestUpdate,
    SupplierQuoteCreate,
    SupplierQuotePublic,
    SupplierQuoteUpdate,
)
from app.models.user import User
from app.services.procurement_service import ProcurementService
from app.shared.permission import require_any_permission, require_permission

router = APIRouter(prefix="/procurement", tags=["procurement"])


def _svc(session: AsyncSession) -> ProcurementService:
    return ProcurementService(session)


# ---------------------------------------------------------------------------
# Purchase Requests
# ---------------------------------------------------------------------------

@router.get("/requests/", response_model=PurchaseRequestsPublic)
async def list_requests(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_VIEW")),
    status_filter: str | None = Query(default=None, alias="status"),
    project_id: uuid.UUID | None = Query(default=None),
    urgency: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PurchaseRequestsPublic:
    return await _svc(session).list_requests(
        current_user.company_id,
        status=status_filter,
        project_id=project_id,
        urgency=urgency,
        skip=skip,
        limit=limit,
    )


@router.post("/requests/", response_model=PurchaseRequestPublic, status_code=status.HTTP_201_CREATED)
async def create_request(
    body: PurchaseRequestCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_REQUEST_CREATE")),
) -> PurchaseRequestPublic:
    return await _svc(session).create_request(body, current_user)


@router.get("/requests/{request_id}", response_model=PurchaseRequestPublic)
async def get_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_VIEW")),
) -> PurchaseRequestPublic:
    return await _svc(session).get_request(request_id, current_user.company_id)


@router.patch("/requests/{request_id}", response_model=PurchaseRequestPublic)
async def update_request(
    request_id: uuid.UUID,
    body: PurchaseRequestUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_REQUEST_CREATE")),
) -> PurchaseRequestPublic:
    return await _svc(session).update_request(request_id, body, current_user)


@router.post("/requests/{request_id}/items", response_model=PurchaseRequestPublic)
async def add_request_item(
    request_id: uuid.UUID,
    body: PurchaseRequestItemCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_REQUEST_CREATE")),
) -> PurchaseRequestPublic:
    """Add material item to draft purchase request."""
    return await _svc(session).add_request_item(request_id, body, current_user)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_REQUEST_CREATE")),
) -> None:
    await _svc(session).delete_request(request_id, current_user)


@router.post("/requests/{request_id}/submit", response_model=PurchaseRequestPublic)
async def submit_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_REQUEST_CREATE")),
) -> PurchaseRequestPublic:
    """Nộp yêu cầu lên kỹ thuật duyệt (draft → pending_tech)."""
    return await _svc(session).submit_request(request_id, current_user)


@router.post("/requests/{request_id}/tech-review", response_model=PurchaseRequestPublic)
async def tech_review(
    request_id: uuid.UUID,
    body: PRReviewRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_TECH_REVIEW")),
) -> PurchaseRequestPublic:
    """Kỹ thuật duyệt/từ chối yêu cầu (pending_tech → pending_director / draft)."""
    return await _svc(session).tech_review(request_id, body, current_user)


@router.post("/requests/{request_id}/director-approve", response_model=PurchaseRequestPublic)
async def director_approve(
    request_id: uuid.UUID,
    body: PRReviewRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_DIRECTOR_APPROVE")),
) -> PurchaseRequestPublic:
    """BGĐ duyệt/từ chối yêu cầu (pending_director → approved / draft)."""
    return await _svc(session).director_approve(request_id, body, current_user)


# ---------------------------------------------------------------------------
# Purchase Orders — per request
# ---------------------------------------------------------------------------

@router.get("/requests/{request_id}/orders", response_model=PurchaseOrdersPublic)
async def list_pos_for_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_VIEW")),
) -> PurchaseOrdersPublic:
    return await _svc(session).list_pos_for_request(request_id, current_user.company_id)


@router.post(
    "/requests/{request_id}/orders",
    response_model=PurchaseOrderPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_po(
    request_id: uuid.UUID,
    body: PurchaseOrderCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_PO_CREATE")),
) -> PurchaseOrderPublic:
    """Phòng vật tư tạo đơn đặt hàng sau khi yêu cầu được BGĐ duyệt."""
    return await _svc(session).create_po(request_id, body, current_user)


# ---------------------------------------------------------------------------
# Purchase Orders — standalone
# ---------------------------------------------------------------------------

@router.get("/orders/", response_model=PurchaseOrdersPublic)
async def list_all_orders(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_VIEW")),
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PurchaseOrdersPublic:
    return await _svc(session).list_all_pos(
        current_user.company_id, status=status_filter, skip=skip, limit=limit
    )


@router.get("/orders/{po_id}", response_model=PurchaseOrderPublic)
async def get_order(
    po_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_VIEW")),
) -> PurchaseOrderPublic:
    return await _svc(session).get_po(po_id, current_user.company_id)


@router.post(
    "/orders/{po_id}/items/{item_id}/quotes",
    response_model=list[SupplierQuotePublic],
    status_code=status.HTTP_201_CREATED,
)
async def add_supplier_quotes(
    po_id: uuid.UUID,
    item_id: uuid.UUID,
    quotes: list[SupplierQuoteCreate],
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_PO_CREATE")),
) -> list[SupplierQuotePublic]:
    """Phòng vật tư nhập báo giá nhà cung cấp (tối đa 3 per item)."""
    return await _svc(session).add_quotes_to_item(po_id, item_id, quotes, current_user)


@router.patch(
    "/orders/{po_id}/items/{item_id}/quotes/{quote_id}",
    response_model=SupplierQuotePublic,
)
async def update_supplier_quote(
    po_id: uuid.UUID,
    item_id: uuid.UUID,
    quote_id: uuid.UUID,
    body: SupplierQuoteUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_PO_CREATE")),
) -> SupplierQuotePublic:
    """Phòng vật tư cập nhật báo giá nhà cung cấp cho từng hạng mục."""
    return await _svc(session).update_quote_for_item(po_id, item_id, quote_id, body, current_user)


@router.post("/orders/{po_id}/select-suppliers", response_model=PurchaseOrderPublic)
async def select_suppliers(
    po_id: uuid.UUID,
    body: POSelectSuppliersRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_DIRECTOR_APPROVE")),
) -> PurchaseOrderPublic:
    """BGĐ chọn nhà cung cấp cho từng hạng mục (pending_supplier_selection → approved)."""
    return await _svc(session).select_suppliers(po_id, body, current_user)


@router.post("/orders/{po_id}/mark-ordered", response_model=PurchaseOrderPublic)
async def mark_ordered(
    po_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_PO_CREATE")),
) -> PurchaseOrderPublic:
    """Xác nhận đã đặt hàng (approved → ordered)."""
    return await _svc(session).mark_ordered(po_id, current_user)


@router.post("/orders/{po_id}/receive", response_model=PurchaseOrderPublic)
async def receive_order(
    po_id: uuid.UUID,
    body: POReceiveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROCUREMENT_RECEIVE")),
) -> PurchaseOrderPublic:
    """Nhận hàng từ nhà cung cấp (ordered → partially_received / received)."""
    return await _svc(session).receive_po(po_id, body, current_user)
