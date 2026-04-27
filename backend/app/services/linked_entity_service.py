"""Linked entity service — create procurement/inventory entities from a task and link them back."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract import Contract
from app.models.inventory import LinkedEntityCreate, MaterialIssue, MaterialIssueItem
from app.models.procurement import PurchaseRequest
from app.models.task import Task, TaskPublic
from app.models.user import User
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.procurement_repository import ProcurementRepository
from app.repositories.task_repository import TaskRepository
from app.services.task_service import _enrich  # noqa: WPS450


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# module_tag values that map to purchase_request
_PROCUREMENT_TAGS = {"procurement", "supply"}


class LinkedEntityService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._task_repo = TaskRepository(session)
        self._proc_repo = ProcurementRepository(session)
        self._inv_repo = InventoryRepository(session)

    async def create_and_link(
        self, task_id: uuid.UUID, current_user: User, body: LinkedEntityCreate
    ) -> TaskPublic:
        """Create a business entity for a task and link it back."""
        task = await self._task_repo.get_or_404(task_id)

        requested_type = (body.entity_type or "").strip().lower() or None
        if requested_type not in (None, "purchase_request", "material_issue"):
            raise HTTPException(
                400,
                "entity_type không hợp lệ. Chỉ chấp nhận: purchase_request hoặc material_issue.",
            )

        module = task.module_tag
        resolved_type = requested_type
        if resolved_type is None:
            resolved_type = "purchase_request" if module in _PROCUREMENT_TAGS else "material_issue"

        if resolved_type == "purchase_request":
            entity_id = await self._create_purchase_request(task, current_user)
            task.linked_entity_type = "purchase_request"
        else:
            entity_id = await self._create_material_issue(task, current_user, body.items)
            task.linked_entity_type = "material_issue"

        await self._task_repo.add_task_linked_entity(
            task_id=task.id,
            entity_type=task.linked_entity_type,
            entity_id=entity_id,
            created_by=current_user.id,
        )

        # Backward compatibility for legacy clients that still read singular fields.
        task.linked_entity_id = entity_id
        task.updated_at = _utcnow()
        self._session.add(task)
        await self._session.flush()
        return await _enrich(task, self._session)

    async def _create_purchase_request(self, task: Task, current_user: User) -> uuid.UUID:
        """Create a PurchaseRequest from a procurement/supply task."""
        year = _utcnow().year
        request_number = await self._proc_repo.next_request_number(year)
        contract_id = await self._find_contract_id_for_project(task.project_id, current_user.company_id)

        pr = PurchaseRequest(
            company_id=current_user.company_id,
            project_id=task.project_id,
            contract_id=contract_id,
            request_number=request_number,
            title=task.name,
            urgency="normal",
            status="draft",
            requested_by=current_user.id,
        )
        self._session.add(pr)
        await self._session.flush()
        return pr.id

    async def _create_material_issue(
        self, task: Task, current_user: User, items: list
    ) -> uuid.UUID:
        """Create a MaterialIssue (xuất kho) from a task."""
        year = _utcnow().year
        issue_number = await self._inv_repo.next_issue_number(year)
        contract_id = await self._find_contract_id_for_project(task.project_id, current_user.company_id)

        issue = MaterialIssue(
            company_id=current_user.company_id,
            project_id=task.project_id,
            contract_id=contract_id,
            task_id=task.id,
            issue_number=issue_number,
            requested_by=current_user.id,
            notes=f"Xuất kho cho công việc: {task.name}",
            status="pending",
        )
        self._session.add(issue)
        await self._session.flush()

        for it in items:
            issue_item = MaterialIssueItem(
                issue_id=issue.id,
                inventory_item_id=it.inventory_item_id,
                quantity_requested=it.quantity_requested,
            )
            self._session.add(issue_item)
        await self._session.flush()

        return issue.id

    async def _find_contract_id_for_project(
        self,
        project_id: uuid.UUID | None,
        company_id: uuid.UUID | None,
    ) -> uuid.UUID | None:
        """Resolve the newest active contract linked to a project."""
        if project_id is None or company_id is None:
            return None
        result = await self._session.execute(
            select(Contract)
            .where(
                Contract.project_id == project_id,
                Contract.company_id == company_id,
                Contract.is_deleted == False,  # noqa: E712
            )
            .order_by(Contract.created_at.desc())
            .limit(1)
        )
        contract = result.scalars().first()
        return contract.id if contract else None
