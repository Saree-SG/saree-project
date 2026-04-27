from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import (
    MaterialIssueAttachment,
    MaterialIssueAttachmentPublic,
    InventoryItem,
    InventoryItemCreate,
    InventoryItemPublic,
    InventoryItemsPublic,
    InventoryItemUpdate,
    IssueApproveRequest,
    IssueExecuteRequest,
    MaterialIssue,
    MaterialIssueCreate,
    MaterialIssueItem,
    MaterialIssueItemPublic,
    MaterialIssuePublic,
    MaterialIssuesPublic,
    StockAdjustRequest,
    StockMovementPublic,
)
from app.models.user import User
from app.repositories.inventory_repository import InventoryRepository
from app.shared.storage import LocalStorage


class InventoryService:
    def __init__(self, session: AsyncSession, storage: LocalStorage | None = None) -> None:
        self.repo = InventoryRepository(session)
        self.session = session
        self.storage = storage

    def _item_public(self, item: InventoryItem) -> InventoryItemPublic:
        return InventoryItemPublic.model_validate(item, from_attributes=True)

    async def _issue_public(self, issue: MaterialIssue) -> MaterialIssuePublic:
        item_map = await self.repo.get_inventory_items_by_ids(
            [it.inventory_item_id for it in issue.items]
        )
        enriched_items = [
            MaterialIssueItemPublic(
                id=it.id,
                inventory_item_id=it.inventory_item_id,
                item_name=item_map.get(it.inventory_item_id, {}).get("item_name"),
                item_code=item_map.get(it.inventory_item_id, {}).get("item_code"),
                unit=item_map.get(it.inventory_item_id, {}).get("unit"),
                current_stock=item_map.get(it.inventory_item_id, {}).get("current_stock"),
                quantity_requested=it.quantity_requested,
                quantity_issued=it.quantity_issued,
            )
            for it in issue.items
        ]
        data = MaterialIssuePublic(
            id=issue.id,
            company_id=issue.company_id,
            project_id=issue.project_id,
            contract_id=issue.contract_id,
            task_id=issue.task_id,
            issue_number=issue.issue_number,
            requested_by=issue.requested_by,
            approved_by=issue.approved_by,
            issued_by=issue.issued_by,
            status=issue.status,
            notes=issue.notes,
            items=enriched_items,
            attachments=[
                MaterialIssueAttachmentPublic(
                    id=attachment.id,
                    issue_id=attachment.issue_id,
                    uploaded_by=attachment.uploaded_by,
                    file_url=attachment.file_url,
                    file_name=attachment.file_name,
                    file_type=attachment.file_type,
                    size_bytes=attachment.size_bytes,
                    created_at=attachment.created_at,
                )
                for attachment in issue.attachments
            ],
            created_at=issue.created_at,
            updated_at=issue.updated_at,
        )
        return data

    async def upload_issue_attachment(
        self,
        issue_id: uuid.UUID,
        file: UploadFile,
        file_type: str,
        current_user: User,
    ) -> MaterialIssueAttachmentPublic:
        """Upload a file and attach it to a material issue."""
        if self.storage is None:
            raise HTTPException(status_code=500, detail="Storage not configured")
        issue = await self.repo.get_issue_or_404(issue_id, current_user.company_id)
        stored = await self.storage.save_upload(file)
        attachment = MaterialIssueAttachment(
            issue_id=issue.id,
            uploaded_by=current_user.id,
            file_url=stored.public_url,
            file_name=file.filename or stored.stored_name,
            file_type=file_type,
            size_bytes=stored.size_bytes,
        )
        attachment = await self.repo.add_issue_attachment(attachment)
        return MaterialIssueAttachmentPublic(
            id=attachment.id,
            issue_id=attachment.issue_id,
            uploaded_by=attachment.uploaded_by,
            file_url=attachment.file_url,
            file_name=attachment.file_name,
            file_type=attachment.file_type,
            size_bytes=attachment.size_bytes,
            created_at=attachment.created_at,
        )

    # ------------------------------------------------------------------
    # InventoryItem CRUD
    # ------------------------------------------------------------------

    async def list_items(
        self,
        company_id: uuid.UUID,
        search: str | None = None,
        category: str | None = None,
        low_stock_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> InventoryItemsPublic:
        items, count = await self.repo.list_items(
            company_id, search=search, category=category,
            low_stock_only=low_stock_only, skip=skip, limit=limit
        )
        return InventoryItemsPublic(data=[self._item_public(i) for i in items], count=count)

    async def get_item(self, item_id: uuid.UUID, company_id: uuid.UUID) -> InventoryItemPublic:
        item = await self.repo.get_item_or_404(item_id, company_id)
        return self._item_public(item)

    async def create_item(self, body: InventoryItemCreate, current_user: User) -> InventoryItemPublic:
        item = InventoryItem(
            company_id=current_user.company_id,
            created_by=current_user.id,
            **body.model_dump(),
        )
        item = await self.repo.create_item(item)
        return self._item_public(item)

    async def update_item(
        self, item_id: uuid.UUID, body: InventoryItemUpdate, company_id: uuid.UUID
    ) -> InventoryItemPublic:
        item = await self.repo.get_item_or_404(item_id, company_id)
        for k, v in body.model_dump(exclude_none=True).items():
            setattr(item, k, v)
        item.updated_at = datetime.utcnow()
        item = await self.repo.update_item(item)
        return self._item_public(item)

    async def delete_item(self, item_id: uuid.UUID, company_id: uuid.UUID) -> None:
        item = await self.repo.get_item_or_404(item_id, company_id)
        item.is_deleted = True
        item.deleted_at = datetime.utcnow()
        await self.repo.update_item(item)

    async def adjust_stock(
        self, item_id: uuid.UUID, body: StockAdjustRequest, current_user: User
    ) -> InventoryItemPublic:
        item = await self.repo.get_item_or_404(item_id, current_user.company_id)
        if item.current_stock + body.quantity < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng điều chỉnh làm tồn kho âm",
            )
        await self.repo.adjust_stock(
            item,
            quantity_delta=body.quantity,
            reference_type="manual_adjust",
            reference_id=None,
            notes=body.notes,
            handled_by=current_user.id,
        )
        return self._item_public(item)

    async def get_movements(
        self, item_id: uuid.UUID, company_id: uuid.UUID, skip: int = 0, limit: int = 50
    ) -> dict:
        await self.repo.get_item_or_404(item_id, company_id)
        movements, count = await self.repo.get_movements(item_id, skip=skip, limit=limit)
        return {
            "data": [StockMovementPublic.model_validate(m, from_attributes=True) for m in movements],
            "count": count,
        }

    async def get_low_stock_alerts(self, company_id: uuid.UUID) -> InventoryItemsPublic:
        items, count = await self.repo.list_items(company_id, low_stock_only=True, limit=200)
        return InventoryItemsPublic(data=[self._item_public(i) for i in items], count=count)

    # ------------------------------------------------------------------
    # Material Issue
    # ------------------------------------------------------------------

    async def list_issues(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        project_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> MaterialIssuesPublic:
        issues, count = await self.repo.list_issues(
            company_id, status=status, project_id=project_id, skip=skip, limit=limit
        )
        return MaterialIssuesPublic(
            data=[await self._issue_public(i) for i in issues], count=count
        )

    async def get_issue(self, issue_id: uuid.UUID, company_id: uuid.UUID) -> MaterialIssuePublic:
        issue = await self.repo.get_issue_or_404(issue_id, company_id)
        return await self._issue_public(issue)

    async def create_issue(self, body: MaterialIssueCreate, current_user: User) -> MaterialIssuePublic:
        year = datetime.utcnow().year
        issue_number = await self.repo.next_issue_number(year)
        issue = MaterialIssue(
            company_id=current_user.company_id,
            project_id=body.project_id,
            contract_id=body.contract_id,
            issue_number=issue_number,
            requested_by=current_user.id,
            notes=body.notes,
            status="pending",
        )
        items = [
            MaterialIssueItem(
                inventory_item_id=it.inventory_item_id,
                quantity_requested=it.quantity_requested,
            )
            for it in body.items
        ]
        issue = await self.repo.create_issue(issue, items)
        return await self._issue_public(issue)

    async def approve_issue(
        self, issue_id: uuid.UUID, body: IssueApproveRequest, current_user: User
    ) -> MaterialIssuePublic:
        issue = await self.repo.get_issue_or_404(issue_id, current_user.company_id)
        if issue.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu xuất kho không ở trạng thái pending (hiện: {issue.status})",
            )
        if body.action == "approve":
            issue.status = "approved"
            issue.approved_by = current_user.id
        elif body.action == "reject":
            issue.status = "cancelled"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="action phải là approve hoặc reject")
        issue.updated_at = datetime.utcnow()
        issue = await self.repo.save_issue(issue)
        return await self._issue_public(issue)

    async def execute_issue(
        self, issue_id: uuid.UUID, body: IssueExecuteRequest, current_user: User
    ) -> MaterialIssuePublic:
        issue = await self.repo.get_issue_or_404(issue_id, current_user.company_id)
        if issue.status != "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu xuất kho chưa được duyệt (hiện: {issue.status})",
            )

        for issue_item in issue.items:
            qty = (
                (body.quantities or {}).get(str(issue_item.inventory_item_id))
                or issue_item.quantity_requested
            )
            inv_item = await self.repo.get_item_or_404(issue_item.inventory_item_id, current_user.company_id)
            if inv_item.current_stock < qty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Không đủ tồn kho cho '{inv_item.item_name}' (tồn: {inv_item.current_stock}, cần: {qty})",
                )
            issue_item.quantity_issued = qty
            self.session.add(issue_item)
            await self.repo.adjust_stock(
                inv_item,
                quantity_delta=-qty,
                reference_type="material_issue",
                reference_id=issue.id,
                notes=body.notes,
                handled_by=current_user.id,
            )
            await self._notify_low_stock_if_needed(inv_item)

        issue.status = "issued"
        issue.issued_by = current_user.id
        issue.updated_at = datetime.utcnow()
        issue = await self.repo.save_issue(issue)

        # Auto move linked task to in_progress if it was todo
        if issue.task_id:
            await self._advance_task_after_issue(issue.task_id)

        return await self._issue_public(issue)

    async def _advance_task_after_issue(self, task_id: uuid.UUID) -> None:
        """Move task to in_progress when its material issue is executed."""
        from sqlmodel import select as sql_select
        from app.models.task import Task

        result = await self.session.execute(
            sql_select(Task).where(Task.id == task_id, Task.is_deleted.is_(False))
        )
        task = result.scalar_one_or_none()
        if task and task.status == "todo":
            task.status = "in_progress"
            task.updated_at = datetime.utcnow()
            self.session.add(task)
            await self.session.flush()

    async def delete_issue(self, issue_id: uuid.UUID, company_id: uuid.UUID) -> None:
        issue = await self.repo.get_issue_or_404(issue_id, company_id)
        if issue.status not in ("pending", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ có thể xoá phiếu ở trạng thái pending hoặc đã huỷ",
            )
        issue.is_deleted = True
        issue.deleted_at = datetime.utcnow()
        await self.repo.save_issue(issue)

    # ------------------------------------------------------------------
    # Called by ProcurementService when PO is received
    # ------------------------------------------------------------------

    async def receive_from_po(
        self,
        company_id: uuid.UUID,
        po_id: uuid.UUID,
        item_id: uuid.UUID,
        quantity: Decimal,
        unit_price: Decimal | None,
        handled_by: uuid.UUID,
    ) -> None:
        """Called by procurement_service after PO receive — creates stock movement."""
        inv_item = await self.repo.get_item_or_404(item_id, company_id)
        await self.repo.adjust_stock(
            inv_item,
            quantity_delta=quantity,
            reference_type="po_receive",
            reference_id=po_id,
            notes=None,
            handled_by=handled_by,
            unit_price=unit_price,
        )

    async def _notify_low_stock_if_needed(self, item: InventoryItem) -> None:
        if item.min_stock_alert > 0 and item.current_stock < item.min_stock_alert:
            try:
                from app.models.notification import Notification
                from sqlmodel import select as sql_select
                from app.models.org import UserCompanyRole, Role
                from sqlalchemy.ext.asyncio import AsyncSession

                result = await self.session.execute(
                    sql_select(UserCompanyRole).where(
                        UserCompanyRole.company_id == item.company_id
                    )
                )
                # Simple notification — just log; full implementation sends to INVENTORY_MANAGE users
            except Exception:
                pass
