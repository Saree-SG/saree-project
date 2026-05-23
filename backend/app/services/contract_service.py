"""Contract service — business logic and status machine."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract import (
    CONTRACT_STATUS_LABELS,
    Contract,
    ContractActionRequest,
    ContractAttachmentPublic,
    ContractConfirmAdvanceRequest,
    ContractCreate,
    ContractPublic,
    ContractSignRequest,
    ContractsPublic,
    ContractStatusTransitionPublic,
    ContractUpdate,
    ContractWithDetailsPublic,
)
from app.models.notification import Notification
from app.models.org import Department, Role, UserCompanyRole
from app.models.task import Task, TaskDependency
from app.models.user import User
from app.repositories.contract_repository import ContractRepository
from app.repositories.quotation_repository import QuotationRepository
from app.repositories.user_repository import UserRepository
from app.services.push_service import send_push_to_user
from app.shared.storage import LocalStorage


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utcnow() -> datetime:
    """Return naive UTC datetime for TIMESTAMP WITHOUT TIME ZONE columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------

# (current_status, action) → next_status
_TRANSITIONS: dict[tuple[str, str], str] = {
    ("draft", "submit"): "pending_approval",
    ("pending_approval", "approve"): "sent",
    ("pending_approval", "reject"): "draft",
    ("sent", "sign"): "signed",
    ("signed", "confirm_advance"): "advance_received",
    ("advance_received", "start_production"): "in_production",
    ("in_production", "complete"): "completed",
}

# action → required permission code
_ACTION_PERMISSION: dict[str, str] = {
    "submit": "CONTRACT_SUBMIT",
    "approve": "CONTRACT_APPROVE",
    "reject": "CONTRACT_APPROVE",
    "sign": "CONTRACT_SIGN",
    "confirm_advance": "CONTRACT_CONFIRM_ADVANCE",
    "start_production": "CONTRACT_START_PRODUCTION",
    "complete": "CONTRACT_COMPLETE",
}


class ContractService:

    def __init__(self, session: AsyncSession, storage: LocalStorage | None = None) -> None:
        self._session = session
        self._repo = ContractRepository(session)
        self._quotation_repo = QuotationRepository(session)
        self._user_repo = UserRepository(session)
        self._storage = storage

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def list_contracts(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> ContractsPublic:
        items, total = await self._repo.list_with_filters(
            company_id, status=status, skip=skip, limit=limit
        )
        return ContractsPublic(
            data=[_to_public(c) for c in items],
            count=total,
        )

    async def get_contract(
        self, contract_id: uuid.UUID, company_id: uuid.UUID
    ) -> ContractWithDetailsPublic:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, company_id)
        attachments = await self._repo.get_attachments(contract_id)
        transitions = await self._repo.get_transitions(contract_id)
        pub = ContractWithDetailsPublic.model_validate(_to_public(c).model_dump())
        pub.attachments = [ContractAttachmentPublic.model_validate(a) for a in attachments]
        pub.transitions = [ContractStatusTransitionPublic.model_validate(t) for t in transitions]
        return pub

    async def create_contract(
        self, body: ContractCreate, current_user: User
    ) -> ContractPublic:
        # Validate quotation exists and is won
        quotation = await self._quotation_repo.get_or_404(body.quotation_id)
        if quotation.outcome != "won":
            raise HTTPException(
                status_code=400,
                detail="Chỉ có thể tạo hợp đồng từ báo giá đã thắng (closed_won)",
            )
        # One contract per quotation
        existing = await self._repo.get_by_quotation_id(body.quotation_id)
        if existing:
            raise HTTPException(
                status_code=409, detail="Hợp đồng cho báo giá này đã tồn tại"
            )

        year = _utcnow().year
        contract_number = await self._repo.next_contract_number(year)

        project_id = body.project_id or quotation.won_project_id

        c = await self._repo.add({
            **body.model_dump(exclude={"project_id"}),
            "company_id": current_user.company_id,
            "created_by": current_user.id,
            "contract_number": contract_number,
            "project_id": project_id,
            "status": "draft",
        })

        await self._repo.add_transition({
            "contract_id": c.id,
            "from_status": None,
            "to_status": "draft",
            "actor_id": current_user.id,
            "actor_name": current_user.full_name,
            "action": "create",
            "note": None,
        })

        return _to_public(c)

    async def update_contract(
        self, contract_id: uuid.UUID, body: ContractUpdate, current_user: User
    ) -> ContractPublic:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, current_user.company_id)
        if c.status not in ("draft",):
            raise HTTPException(
                status_code=400, detail="Chỉ có thể chỉnh sửa hợp đồng ở trạng thái draft"
            )
        patch = body.model_dump(exclude_unset=True)
        for k, v in patch.items():
            setattr(c, k, v)
        c.updated_at = _utcnow()
        await self._repo.save(c)
        return _to_public(c)

    async def delete_contract(self, contract_id: uuid.UUID, current_user: User) -> None:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, current_user.company_id)
        if c.status not in ("draft",):
            raise HTTPException(
                status_code=400, detail="Chỉ có thể xóa hợp đồng ở trạng thái draft"
            )
        c.is_deleted = True
        c.deleted_at = _utcnow()
        await self._repo.save(c)

    # ------------------------------------------------------------------
    # Status transitions
    # ------------------------------------------------------------------

    async def transition(
        self,
        contract_id: uuid.UUID,
        action: str,
        current_user: User,
        *,
        note: str | None = None,
        signing_date: date | None = None,
        advance_amount: float | None = None,
        advance_paid_at: datetime | None = None,
    ) -> ContractPublic:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, current_user.company_id)

        key = (c.status, action)
        next_status = _TRANSITIONS.get(key)
        if next_status is None:
            raise HTTPException(
                status_code=400,
                detail=f"Không thể thực hiện '{action}' từ trạng thái '{c.status}'",
            )

        old_status = c.status
        c.status = next_status
        c.updated_at = _utcnow()

        # Extra fields for specific actions
        if action == "sign" and signing_date:
            c.signing_date = signing_date
        if action == "confirm_advance":
            if advance_amount is not None:
                c.advance_amount = advance_amount
            if advance_paid_at is not None:
                c.advance_paid_at = advance_paid_at
            c.advance_paid_by = current_user.id

        await self._repo.save(c)

        await self._repo.add_transition({
            "contract_id": c.id,
            "from_status": old_status,
            "to_status": next_status,
            "actor_id": current_user.id,
            "actor_name": current_user.full_name,
            "action": action,
            "note": note,
        })

        # Notify contract creator if someone else acts
        if c.created_by != current_user.id:
            await self._notify(
                user_id=c.created_by,
                notif_type="contract_status_changed",
                title=f"[{c.contract_number}] Trạng thái cập nhật",
                body=f"Hợp đồng chuyển sang '{CONTRACT_STATUS_LABELS.get(next_status, next_status)}'",
                entity_id=c.id,
            )

        if action == "start_production" and c.project_id is not None:
            await self._create_production_tasks(c, current_user)

        return _to_public(c)

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def upload_attachment(
        self,
        contract_id: uuid.UUID,
        file: UploadFile,
        file_type: str,
        description: str | None,
        current_user: User,
        phase: str | None = None,
    ) -> ContractAttachmentPublic:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, current_user.company_id)

        if self._storage is None:
            raise HTTPException(status_code=500, detail="Storage not configured")

        stored = await self._storage.save_upload(file)
        att = await self._repo.add_attachment({
            "contract_id": contract_id,
            "uploaded_by": current_user.id,
            "file_url": stored.public_url,
            "file_name": file.filename or stored.stored_name,
            "file_type": file_type,
            "phase": phase,
            "description": description,
        })
        return ContractAttachmentPublic.model_validate(att)

    async def delete_attachment(
        self, contract_id: uuid.UUID, att_id: uuid.UUID, current_user: User
    ) -> None:
        c = await self._repo.get_or_404(contract_id)
        _assert_company(c, current_user.company_id)
        att = await self._repo.get_attachment_or_404(contract_id, att_id)
        await self._repo.delete_attachment(att)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _find_assignee_for_dept(
        self,
        company_id: uuid.UUID,
        dept_name: str,
        role_name: str,
        dept_head_role_id: uuid.UUID | None,
    ) -> "User | None":
        """Find the department head (or specific role holder) for a given department."""
        dept_result = await self._session.execute(
            select(Department).where(
                Department.company_id == company_id,
                Department.name == dept_name,
            )
        )
        dept = dept_result.scalars().first()

        # For office departments: find user with department_head role in that dept
        if dept and dept_head_role_id:
            head_result = await self._session.execute(
                select(User)
                .join(UserCompanyRole, UserCompanyRole.user_id == User.id)
                .where(
                    User.company_id == company_id,
                    User.department_id == dept.id,
                    UserCompanyRole.role_id == dept_head_role_id,
                )
                .limit(1)
            )
            head = head_result.scalars().first()
            if head:
                return head

        # Fallback: find user with the specific role (for project_block departments)
        role_result = await self._session.execute(
            select(Role).where(
                Role.company_id == company_id,
                Role.name == role_name,
            )
        )
        role = role_result.scalars().first()
        if role is None:
            return None

        if dept:
            user_result = await self._session.execute(
                select(User)
                .join(UserCompanyRole, UserCompanyRole.user_id == User.id)
                .where(
                    User.company_id == company_id,
                    User.department_id == dept.id,
                    UserCompanyRole.role_id == role.id,
                )
                .limit(1)
            )
        else:
            user_result = await self._session.execute(
                select(User)
                .join(UserCompanyRole, UserCompanyRole.user_id == User.id)
                .where(
                    User.company_id == company_id,
                    UserCompanyRole.role_id == role.id,
                )
                .limit(1)
            )
        return user_result.scalars().first()

    async def _create_production_tasks(self, contract: Contract, assignor: User) -> None:
        """Auto-create 6 base tasks with FS dependency chain when contract starts production.

        Chain: KT bản vẽ → KH kế hoạch → VT vật tư → Sản xuất → Cung ứng → Lắp đặt
        Each task is assigned to the user holding the appropriate role in that department.
        If no assignee is found the task is still created (assigned to assignor as fallback)
        but only after exhausting all role-based lookup strategies.
        """
        # (dept_name, role_name, module_tag, task_name, offset_start_days, duration_days)
        _STEPS: list[tuple[str, str, str, str, int, int]] = [
            ("Phòng Kế hoạch",             "planner",       "planning",     "Lên kế hoạch, phân bổ nhân sự sản xuất",   0,  2),
            ("Phòng Kỹ thuật / Thiết kế", "engineer",      "engineering",  "Hiệu chỉnh bản vẽ, phát hành cho các tổ",  2,  3),
            ("Phòng Vật tư",               "materials",     "procurement",  "Đặt hàng vật tư",                           5,  5),
            ("Cung ứng vật tư công trình", "site_supply",   "supply",       "Cung ứng vật tư ra công trình",            10,  7),
            ("Sản xuất xưởng",             "workshop_lead", "production",   "Triển khai sản xuất tại xưởng",            17, 14),
            ("Lắp đặt công trình",         "installer",     "installation", "Lắp đặt và nghiệm thu công trình",         31, 10),
        ]

        dept_head_role_result = await self._session.execute(
            select(Role).where(
                Role.company_id == contract.company_id,
                Role.name == "department_head",
            )
        )
        dept_head_role = dept_head_role_result.scalars().first()
        dept_head_role_id = dept_head_role.id if dept_head_role else None

        now = _naive_utcnow()
        created_tasks: list[Task] = []

        for dept_name, role_name, module_tag, task_name, offset_start, duration in _STEPS:
            assignee = await self._find_assignee_for_dept(
                contract.company_id, dept_name, role_name, dept_head_role_id
            )
            # Only fall back to assignor if truly nobody with the right role exists
            assignee_id = assignee.id if assignee else assignor.id

            task = Task(
                project_id=contract.project_id,
                name=task_name,
                description=f"Tự động tạo khi hợp đồng [{contract.contract_number}] chuyển sang sản xuất.",
                assignee_id=assignee_id,
                assignor_id=assignor.id,
                status="todo",
                level=0,
                is_deleted=False,
                module_tag=module_tag,
                start_time=now + timedelta(days=offset_start),
                end_time=now + timedelta(days=offset_start + duration),
            )
            self._session.add(task)
            await self._session.flush()
            created_tasks.append(task)

            await self._notify(
                user_id=assignee_id,
                notif_type="task_assigned",
                title=f'Bạn được giao công việc "{task_name}"',
                body=f"Hợp đồng [{contract.contract_number}] bắt đầu sản xuất. Được giao bởi {assignor.full_name or assignor.email}.",
                entity_id=task.id,
                entity_type="task",
            )

        # Create FS dependency chain: task[i] must finish before task[i+1] starts
        for i in range(len(created_tasks) - 1):
            dep = TaskDependency(
                blocking_task_id=created_tasks[i].id,
                dependent_task_id=created_tasks[i + 1].id,
                dependency_type="FS",
                lag_hours=0,
            )
            self._session.add(dep)
        await self._session.flush()

    async def _notify(
        self,
        user_id: uuid.UUID,
        notif_type: str,
        title: str,
        body: str,
        entity_id: uuid.UUID,
        entity_type: str = "contract",
    ) -> None:
        try:
            notif = Notification(
                user_id=user_id,
                type=notif_type,
                title=title,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            self._session.add(notif)
            await self._session.flush()
            asyncio.create_task(
                send_push_to_user(self._session, user_id, title, body, entity_type, entity_id)
            )
        except Exception:
            logger.exception("Failed to persist notification user_id={} type={}", user_id, notif_type)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_public(c: Contract) -> ContractPublic:
    pub = ContractPublic.model_validate(c)
    pub.status_label = CONTRACT_STATUS_LABELS.get(c.status)
    return pub


def _assert_company(contract: Contract, company_id: uuid.UUID | None) -> None:
    if contract.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")
