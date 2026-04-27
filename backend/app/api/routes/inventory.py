"""Inventory management routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep
from app.core.config import settings
from app.models.inventory import (
    MaterialIssueAttachmentPublic,
    InventoryItemCreate,
    InventoryItemPublic,
    InventoryItemsPublic,
    InventoryItemUpdate,
    IssueApproveRequest,
    IssueExecuteRequest,
    MaterialIssueCreate,
    MaterialIssuePublic,
    MaterialIssuesPublic,
    StockAdjustRequest,
    StockMovementPublic,
)
from app.models.user import User
from app.services.inventory_service import InventoryService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(prefix="/inventory", tags=["inventory"])
_inventory_issue_storage = LocalStorage(
    base_dir=settings.INVENTORY_ISSUE_UPLOAD_DIR,
    static_url_segment="inventory-issue",
)


def _svc(session: AsyncSession) -> InventoryService:
    return InventoryService(session, storage=_inventory_issue_storage)


# ---------------------------------------------------------------------------
# Inventory items
# ---------------------------------------------------------------------------

@router.get("/items/", response_model=InventoryItemsPublic)
async def list_items(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> InventoryItemsPublic:
    return await _svc(session).list_items(
        current_user.company_id, search=search, category=category, skip=skip, limit=limit
    )


@router.post("/items/", response_model=InventoryItemPublic, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: InventoryItemCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_MANAGE")),
) -> InventoryItemPublic:
    return await _svc(session).create_item(body, current_user)


@router.get("/items/{item_id}", response_model=InventoryItemPublic)
async def get_item(
    item_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
) -> InventoryItemPublic:
    return await _svc(session).get_item(item_id, current_user.company_id)


@router.patch("/items/{item_id}", response_model=InventoryItemPublic)
async def update_item(
    item_id: uuid.UUID,
    body: InventoryItemUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_MANAGE")),
) -> InventoryItemPublic:
    return await _svc(session).update_item(item_id, body, current_user.company_id)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_MANAGE")),
) -> None:
    await _svc(session).delete_item(item_id, current_user.company_id)


@router.get("/items/{item_id}/movements", response_model=dict)
async def get_movements(
    item_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return await _svc(session).get_movements(item_id, current_user.company_id, skip=skip, limit=limit)


@router.post("/items/{item_id}/adjust", response_model=InventoryItemPublic)
async def adjust_stock(
    item_id: uuid.UUID,
    body: StockAdjustRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_MANAGE")),
) -> InventoryItemPublic:
    return await _svc(session).adjust_stock(item_id, body, current_user)


@router.get("/alerts/", response_model=InventoryItemsPublic)
async def get_alerts(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
) -> InventoryItemsPublic:
    return await _svc(session).get_low_stock_alerts(current_user.company_id)


# ---------------------------------------------------------------------------
# Material issue requests
# ---------------------------------------------------------------------------

@router.get("/issues/", response_model=MaterialIssuesPublic)
async def list_issues(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
    status_filter: str | None = Query(default=None, alias="status"),
    project_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MaterialIssuesPublic:
    return await _svc(session).list_issues(
        current_user.company_id,
        status=status_filter,
        project_id=project_id,
        skip=skip,
        limit=limit,
    )


@router.post("/issues/", response_model=MaterialIssuePublic, status_code=status.HTTP_201_CREATED)
async def create_issue(
    body: MaterialIssueCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_ISSUE_REQUEST")),
) -> MaterialIssuePublic:
    return await _svc(session).create_issue(body, current_user)


@router.get("/issues/{issue_id}", response_model=MaterialIssuePublic)
async def get_issue(
    issue_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_VIEW")),
) -> MaterialIssuePublic:
    return await _svc(session).get_issue(issue_id, current_user.company_id)


@router.post("/issues/{issue_id}/approve", response_model=MaterialIssuePublic)
async def approve_issue(
    issue_id: uuid.UUID,
    body: IssueApproveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_APPROVE")),
) -> MaterialIssuePublic:
    return await _svc(session).approve_issue(issue_id, body, current_user)


@router.post("/issues/{issue_id}/execute", response_model=MaterialIssuePublic)
async def execute_issue(
    issue_id: uuid.UUID,
    body: IssueExecuteRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_MANAGE")),
) -> MaterialIssuePublic:
    return await _svc(session).execute_issue(issue_id, body, current_user)


@router.post(
    "/issues/{issue_id}/attachments/upload",
    response_model=MaterialIssueAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_issue_attachment(
    issue_id: uuid.UUID,
    session: AsyncSessionDep,
    file: UploadFile = File(...),
    file_type: str = Query(default="document"),
    current_user: User = Depends(require_permission("INVENTORY_ISSUE_REQUEST")),
) -> MaterialIssueAttachmentPublic:
    return await _svc(session).upload_issue_attachment(
        issue_id,
        file,
        file_type,
        current_user,
    )


@router.delete("/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue(
    issue_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INVENTORY_ISSUE_REQUEST")),
) -> None:
    await _svc(session).delete_issue(issue_id, current_user.company_id)
