"""
Quotation service — business logic and state machine.

Orchestrates: stage transitions, line item recalculation,
Notification dispatch, AuditLog writing, and Project creation on win.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer_company import CustomerCompany
from app.models.notification import Notification
from app.models.project import Project
from sqlmodel import func, select

from app.models.quotation import (
    ACTION_LABELS,
    DIRECTOR_REJECT_STAGES,
    STAGE_LABELS,
    STAGE_ORDER,
    STAGE_TRANSITIONS,
    Quotation,
    QuotationApprovalParticipant,
    QuotationApprovalParticipantCreate,
    QuotationApprovalParticipantPublic,
    QuotationAttachment,
    QuotationAttachmentCreate,
    QuotationAttachmentPublic,
    QuotationCompanyProfilePublic,
    QuotationByClientRow,
    QuotationByEquipmentRow,
    QuotationCloseRequest,
    QuotationCreate,
    QuotationFinalizeRequest,
    QuotationLostReasonRow,
    QuotationNegotiationLog,
    QuotationNegotiationLogCreate,
    QuotationNegotiationLogPublic,
    QuotationPublic,
    QuotationReportSummary,
    QuotationSendToClientRequest,
    QuotationStageTransitionPublic,
    QuotationSubmitDesignRequest,
    QuotationSubmitNegotiationRequest,
    QuotationSubmitPricingRequest,
    QuotationSubmitSurveyRequest,
    QuotationUpdate,
    QuotationVersionPublic,
    QuotationsPublic,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.quotation_repository import QuotationRepository
from app.repositories.user_repository import UserRepository
from app.services.push_service import send_push_bg
from app.shared.permission import has_permission


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Stage → status mapping
# ---------------------------------------------------------------------------

def _stage_to_status(stage: str, action: str = "submit") -> str:
    """Derive the overall status from stage + action."""
    if stage == "S9_CLOSED":
        return "closed_won"  # caller overrides for lost
    if stage == "S8_SENT_TO_CLIENT":
        return "sent"
    if stage == "S8B_NEGOTIATION_REVIEW":
        return "negotiating"
    if stage in ("S7_DIRECTOR_APPROVE_QUOTE", "S2_DIRECTOR_APPROVE_SURVEY", "S4_DIRECTOR_APPROVE_DESIGN"):
        return "in_review"
    return "active"


# ---------------------------------------------------------------------------
# Helper: build QuotationPublic with owner names
# ---------------------------------------------------------------------------

async def _enrich_quotation(
    quotation: Quotation,
    user_repo: UserRepository,
    user_cache: dict[uuid.UUID, Any] | None = None,
) -> QuotationPublic:
    """Attach owner display names to the response schema.

    Pass user_cache when enriching multiple quotations to avoid N+1 queries.
    """
    async def _resolve(uid: uuid.UUID | None) -> str | None:
        if not uid:
            return None
        if user_cache is not None:
            u = user_cache.get(uid)
        else:
            u = await user_repo.get_by_id(uid)
        return u.full_name if u else None

    data = QuotationPublic.model_validate(quotation, from_attributes=True)
    data.sales_owner_name = await _resolve(quotation.sales_owner_id)
    data.technical_owner_name = await _resolve(quotation.technical_owner_id)
    data.procurement_owner_name = await _resolve(quotation.procurement_owner_id)
    data.stage_label = STAGE_LABELS.get(quotation.current_stage)
    return data


async def _enrich_quotations_batch(
    quotations: list[Any], user_repo: UserRepository
) -> list[QuotationPublic]:
    """Batch-enrich a list of quotations with a single user lookup."""
    owner_ids: set[uuid.UUID] = set()
    for q in quotations:
        for fld in (q.sales_owner_id, q.technical_owner_id, q.procurement_owner_id):
            if fld:
                owner_ids.add(fld)
    users = {u.id: u for u in await user_repo.list_by_ids(list(owner_ids))}
    return [await _enrich_quotation(q, user_repo, user_cache=users) for q in quotations]


# ---------------------------------------------------------------------------
# QuotationService
# ---------------------------------------------------------------------------

class QuotationService:
    """Orchestrate all quotation operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = QuotationRepository(session)
        self._user_repo = UserRepository(session)
        self._audit = AuditRepository(session)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _notify(
        self,
        user_id: uuid.UUID,
        notif_type: str,
        title: str,
        body: str,
        entity_id: uuid.UUID,
    ) -> None:
        try:
            notif = Notification(
                user_id=user_id,
                type=notif_type,
                title=title,
                body=body,
                entity_type="quotation",
                entity_id=entity_id,
            )
            self._session.add(notif)
            await self._session.flush()
            asyncio.create_task(
                send_push_bg(user_id, title, body, "quotation", entity_id)
            )
        except Exception:
            logger.exception("Failed to persist notification user_id={} type={}", user_id, notif_type)

    async def _require_stage(self, quotation: Quotation, *stages: str) -> None:
        if quotation.current_stage not in stages:
            expected = " hoặc ".join(STAGE_LABELS.get(s, s) for s in stages)
            raise HTTPException(
                status_code=422,
                detail=f"Hồ sơ đang ở giai đoạn '{STAGE_LABELS.get(quotation.current_stage)}', "
                       f"cần ở '{expected}' để thực hiện thao tác này.",
            )

    def _resolve_reject_stage(
        self,
        current_stage: str,
        default_stage: str,
        target_stage: str | None,
    ) -> str:
        """Validate and return the stage to reject back to.
        target_stage must be before current_stage in STAGE_ORDER.
        Falls back to default_stage if not provided.
        """
        if not target_stage:
            return default_stage
        if target_stage not in STAGE_LABELS:
            raise HTTPException(422, f"Giai đoạn '{target_stage}' không hợp lệ.")
        current_idx = STAGE_ORDER.index(current_stage) if current_stage in STAGE_ORDER else -1
        target_idx = STAGE_ORDER.index(target_stage) if target_stage in STAGE_ORDER else -1
        if target_idx >= current_idx:
            raise HTTPException(422, "Chỉ có thể quay về giai đoạn trước đó.")
        return target_stage

    async def _require_permission_check(
        self,
        user: User,
        permission_code: str,
    ) -> None:
        if not await has_permission(self._session, user, permission_code):
            raise HTTPException(
                status_code=403,
                detail=f"Bạn không có quyền '{permission_code}'.",
            )

    async def _snapshot(
        self,
        quotation: Quotation,
        actor_id: uuid.UUID,
        reason: str,
    ) -> None:
        """Create an immutable version snapshot."""
        attachments = await self._repo.get_attachments(quotation.id)
        ver_num = await self._repo.next_version_number(quotation.id)
        await self._repo.add_version({
            "quotation_id": quotation.id,
            "version_number": ver_num,
            "snapshot_data": {
                "total_contract_value": quotation.total_contract_value,
                "attachments": [
                    {
                        "file_name": a.file_name,
                        "document_category": a.document_category,
                        "file_url": a.file_url,
                        "stage_uploaded": a.stage_uploaded,
                    }
                    for a in attachments
                ],
            },
            "created_by": actor_id,
            "reason": reason,
        })

    # ------------------------------------------------------------------
    # Approval participant helpers
    # ------------------------------------------------------------------

    DIRECTOR_STAGES = {
        "S2_DIRECTOR_APPROVE_SURVEY",
        "S4_DIRECTOR_APPROVE_DESIGN",
        "S7_DIRECTOR_APPROVE_QUOTE",
        "S8B_NEGOTIATION_REVIEW",
    }

    async def _get_participants(
        self,
        quotation_id: uuid.UUID,
        stage: str,
        role: str | None = None,
    ) -> list[QuotationApprovalParticipant]:
        stmt = select(QuotationApprovalParticipant).where(
            QuotationApprovalParticipant.quotation_id == quotation_id,
            QuotationApprovalParticipant.stage == stage,
        )
        if role:
            stmt = stmt.where(QuotationApprovalParticipant.role == role)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def _check_delegate_block(
        self,
        quotation_id: uuid.UUID,
        stage: str,
    ) -> None:
        """Raise 403 if a delegate has been assigned for this stage."""
        delegates = await self._get_participants(quotation_id, stage, role="delegate")
        if delegates:
            raise HTTPException(403, "Bạn đã ủy quyền cho người khác duyệt bước này.")

    async def _handle_co_approver_flow(
        self,
        quotation_id: uuid.UUID,
        stage: str,
        current_user: User,
    ) -> bool:
        """
        If co_approvers exist, record director's primary approval and check if all approved.
        Returns True if the stage should advance (all approved or no co_approvers),
        False if we should wait.
        """
        co_approvers = await self._get_participants(quotation_id, stage, role="co_approver")
        if not co_approvers:
            return True  # No co-approver → advance normally

        # Upsert director's "primary" approval record
        existing_primary = await self._get_participants(quotation_id, stage, role="primary")
        if not existing_primary:
            self._session.add(QuotationApprovalParticipant(
                quotation_id=quotation_id,
                stage=stage,
                user_id=current_user.id,
                role="primary",
                has_approved=True,
                approved_at=_utcnow(),
                created_at=_utcnow(),
            ))
            await self._session.flush()

        # Check if all co_approvers have approved
        all_approved = all(c.has_approved for c in co_approvers)
        return all_approved

    async def list_approval_participants(
        self,
        quotation_id: uuid.UUID,
    ) -> list[QuotationApprovalParticipantPublic]:
        q = await self._repo.get_or_404(quotation_id)
        participants = await self._get_participants(quotation_id, q.current_stage)
        result = []
        for p in participants:
            user = await self._user_repo.get_by_id(p.user_id)
            pub = QuotationApprovalParticipantPublic(
                id=p.id,
                quotation_id=p.quotation_id,
                stage=p.stage,
                user_id=p.user_id,
                user_name=user.full_name if user else None,
                role=p.role,
                has_approved=p.has_approved,
                approved_at=p.approved_at,
                created_at=p.created_at,
            )
            result.append(pub)
        return result

    async def add_approval_participant(
        self,
        quotation_id: uuid.UUID,
        body: QuotationApprovalParticipantCreate,
        current_user: User,
    ) -> QuotationApprovalParticipantPublic:
        q = await self._repo.get_or_404(quotation_id)
        if q.current_stage not in self.DIRECTOR_STAGES:
            raise HTTPException(422, "Chỉ có thể thêm người duyệt ở giai đoạn Giám đốc duyệt.")

        if body.role not in ("co_approver", "delegate"):
            raise HTTPException(422, "role phải là 'co_approver' hoặc 'delegate'.")

        # Validate user exists and is in same company
        target_user = await self._user_repo.get_by_id(body.user_id)
        if not target_user:
            raise HTTPException(404, "Không tìm thấy người dùng.")

        stage = q.current_stage
        existing = await self._get_participants(quotation_id, stage)

        if body.role == "delegate":
            # Remove any existing delegate
            for p in existing:
                if p.role == "delegate":
                    await self._session.delete(p)
            # Cannot have both delegate and co_approver
            co_approvers = [p for p in existing if p.role == "co_approver"]
            if co_approvers:
                raise HTTPException(422, "Không thể ủy quyền khi đã có người co-duyệt. Hãy xóa người co-duyệt trước.")
        elif body.role == "co_approver":
            # Cannot have both co_approver and delegate
            delegates = [p for p in existing if p.role == "delegate"]
            if delegates:
                raise HTTPException(422, "Không thể thêm co-duyệt khi đã có người được ủy quyền. Hãy xóa ủy quyền trước.")
            # Prevent duplicate
            if any(p.user_id == body.user_id for p in existing if p.role == "co_approver"):
                raise HTTPException(422, "Người này đã có trong danh sách co-duyệt.")

        await self._session.flush()

        participant = QuotationApprovalParticipant(
            quotation_id=quotation_id,
            stage=stage,
            user_id=body.user_id,
            role=body.role,
            has_approved=False,
            created_at=_utcnow(),
        )
        self._session.add(participant)
        await self._session.flush()

        return QuotationApprovalParticipantPublic(
            id=participant.id,
            quotation_id=participant.quotation_id,
            stage=participant.stage,
            user_id=participant.user_id,
            user_name=target_user.full_name,
            role=participant.role,
            has_approved=participant.has_approved,
            approved_at=participant.approved_at,
            created_at=participant.created_at,
        )

    _STAGE_NEXT: dict[str, str] = {
        "S2_DIRECTOR_APPROVE_SURVEY": "S3_TECH_DESIGN",
        "S4_DIRECTOR_APPROVE_DESIGN": "S5_PROCUREMENT_PRICING",
        "S7_DIRECTOR_APPROVE_QUOTE": "S8_SENT_TO_CLIENT",
        "S8B_NEGOTIATION_REVIEW": "S6_SALES_FINALIZE",
    }

    async def remove_approval_participant(
        self,
        quotation_id: uuid.UUID,
        participant_id: uuid.UUID,
    ) -> None:
        stmt = select(QuotationApprovalParticipant).where(
            QuotationApprovalParticipant.id == participant_id,
            QuotationApprovalParticipant.quotation_id == quotation_id,
        )
        result = await self._session.execute(stmt)
        p = result.scalars().first()
        if not p:
            raise HTTPException(404, "Không tìm thấy người duyệt.")
        if p.role == "primary":
            raise HTTPException(422, "Không thể xóa bản ghi duyệt chính.")

        removed_role = p.role
        removed_stage = p.stage
        await self._session.delete(p)
        await self._session.flush()

        # Auto-advance if director already approved and no co_approvers remain
        if removed_role == "co_approver":
            q = await self._repo.get_or_404(quotation_id)
            if q.current_stage == removed_stage:
                primary_stmt = select(QuotationApprovalParticipant).where(
                    QuotationApprovalParticipant.quotation_id == quotation_id,
                    QuotationApprovalParticipant.stage == removed_stage,
                    QuotationApprovalParticipant.role == "primary",
                    QuotationApprovalParticipant.has_approved == True,  # noqa: E712
                )
                primary_result = await self._session.execute(primary_stmt)
                director_approved = primary_result.scalars().first() is not None

                remaining_stmt = select(QuotationApprovalParticipant).where(
                    QuotationApprovalParticipant.quotation_id == quotation_id,
                    QuotationApprovalParticipant.stage == removed_stage,
                    QuotationApprovalParticipant.role == "co_approver",
                )
                remaining_result = await self._session.execute(remaining_stmt)
                has_remaining = remaining_result.scalars().first() is not None

                if director_approved and not has_remaining:
                    next_stage = self._STAGE_NEXT.get(removed_stage)
                    if next_stage:
                        q.current_stage = next_stage
                        self._session.add(q)

    async def participant_approve(
        self,
        quotation_id: uuid.UUID,
        note: str | None,
        current_user: User,
    ) -> "QuotationPublic":
        """Co-approver or delegate calls this to record their approval."""
        q = await self._repo.get_or_404(quotation_id)
        if q.current_stage not in self.DIRECTOR_STAGES:
            raise HTTPException(422, "Hồ sơ không ở giai đoạn cần duyệt.")

        stage = q.current_stage
        # Find participant record for current user
        stmt = select(QuotationApprovalParticipant).where(
            QuotationApprovalParticipant.quotation_id == quotation_id,
            QuotationApprovalParticipant.stage == stage,
            QuotationApprovalParticipant.user_id == current_user.id,
            QuotationApprovalParticipant.role.in_(["co_approver", "delegate"]),
        )
        result = await self._session.execute(stmt)
        participant = result.scalars().first()
        if not participant:
            raise HTTPException(403, "Bạn không phải người được ủy quyền hoặc co-duyệt cho bước này.")

        if participant.has_approved:
            raise HTTPException(422, "Bạn đã xác nhận duyệt rồi.")

        participant.has_approved = True
        participant.approved_at = _utcnow()
        self._session.add(participant)
        await self._session.flush()

        # Determine whether to advance stage
        should_advance = False
        if participant.role == "delegate":
            should_advance = True
        elif participant.role == "co_approver":
            # Check if director (primary) has also approved
            primary_list = await self._get_participants(quotation_id, stage, role="primary")
            director_approved = bool(primary_list and primary_list[0].has_approved)
            should_advance = director_approved

        if not should_advance:
            return await _enrich_quotation(q, self._user_repo)

        # Advance the stage (reuse per-stage logic inline)
        old_stage = q.current_stage
        if stage == "S2_DIRECTOR_APPROVE_SURVEY":
            q.current_stage = "S3_TECH_DESIGN"
            q.status = "active"
            action_label = "approve_survey"
            notify_user = q.technical_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Kỹ Thuật cần thiết kế"
            notify_body = f"Đã duyệt khảo sát. Hồ sơ '{q.project_name}' chờ thiết kế."
        elif stage == "S4_DIRECTOR_APPROVE_DESIGN":
            q.current_stage = "S5_PROCUREMENT_PRICING"
            q.status = "active"
            action_label = "approve_design"
            notify_user = q.procurement_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Vật Tư cần báo đơn giá"
            notify_body = f"Đã duyệt thiết kế. Hồ sơ '{q.project_name}' chờ báo đơn giá."
        elif stage == "S7_DIRECTOR_APPROVE_QUOTE":
            q.current_stage = "S8_SENT_TO_CLIENT"
            q.status = "active"
            action_label = "approve_final"
            notify_user = q.sales_owner_id
            notify_title = f"[{q.quote_number}] Chào giá đã được duyệt"
            notify_body = f"Đã phê duyệt chào giá '{q.project_name}'. Có thể gửi cho khách hàng."
            await self._snapshot(q, current_user.id, "initial_approval")
        elif stage == "S8B_NEGOTIATION_REVIEW":
            await self._snapshot(q, current_user.id, "negotiation_approved")
            q.current_stage = "S6_SALES_FINALIZE"
            q.status = "active"
            action_label = "approve_negotiation"
            notify_user = q.sales_owner_id
            notify_title = f"[{q.quote_number}] Đồng ý điều chỉnh giá"
            notify_body = f"Hồ sơ '{q.project_name}' quay lại hoàn thiện bảng giá mới."
        else:
            return await _enrich_quotation(q, self._user_repo)

        q.updated_at = _utcnow()
        await self._repo.save(q)
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": action_label,
            "note": note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.participant_{action_label}",
            entity_type="quotation",
            entity_id=q.id,
        )
        await self._notify(
            user_id=notify_user,
            notif_type="quotation_stage_changed",
            title=notify_title,
            body=notify_body,
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def _resolve_customer_company(
        self,
        current_user: User,
        client_company_id: uuid.UUID | None,
        client_company_name: str | None,
    ) -> tuple[uuid.UUID | None, dict[str, Any]]:
        """Resolve the linked customer company and a snapshot of its text fields.

        - If ``client_company_id`` is given, validate it belongs to the tenant
          and return a snapshot (name/contact/address) to keep the quotation
          text fields consistent.
        - Otherwise, if a name is given, find-or-create a customer company for
          the tenant (deduped by lower(name)) so the directory stays populated.
        Returns (resolved_id, snapshot_fields).
        """
        tenant_id = current_user.company_id
        if tenant_id is None:
            return None, {}

        customer: CustomerCompany | None = None
        if client_company_id is not None:
            customer = await self._session.get(CustomerCompany, client_company_id)
            if customer is None or customer.is_deleted or customer.company_id != tenant_id:
                raise HTTPException(404, "Customer company not found")
        elif client_company_name and client_company_name.strip():
            name = client_company_name.strip()
            existing = await self._session.execute(
                select(CustomerCompany).where(
                    CustomerCompany.company_id == tenant_id,
                    CustomerCompany.is_deleted == False,  # noqa: E712
                    func.lower(CustomerCompany.name) == name.lower(),
                )
            )
            customer = existing.scalars().first()
            if customer is None:
                customer = CustomerCompany(
                    company_id=tenant_id,
                    created_by=current_user.id,
                    type="customer",
                    name=name,
                )
                self._session.add(customer)
                await self._session.flush()

        if customer is None:
            return None, {}

        snapshot = {
            "client_company_name": customer.name,
            "client_contact_name": customer.contact_name,
            "client_contact_title": customer.contact_title,
            "client_contact_phone": customer.contact_phone,
            "client_contact_email": customer.contact_email,
            "client_address": customer.address,
        }
        return customer.id, snapshot

    async def create_quotation(
        self, body: QuotationCreate, current_user: User
    ) -> QuotationPublic:
        from datetime import date as _date

        year = _date.today().year
        quote_number = await self._repo.next_quote_number(year)

        resolved_id, snapshot = await self._resolve_customer_company(
            current_user, body.client_company_id, body.client_company_name
        )

        quotation = Quotation(
            company_id=current_user.company_id,
            quote_number=quote_number,
            project_name=body.project_name,
            client_company_id=resolved_id,
            client_company_name=snapshot.get("client_company_name") or body.client_company_name,
            client_contact_name=snapshot.get("client_contact_name") or body.client_contact_name,
            client_contact_title=snapshot.get("client_contact_title") or body.client_contact_title,
            client_contact_phone=snapshot.get("client_contact_phone") or body.client_contact_phone,
            client_contact_email=snapshot.get("client_contact_email") or body.client_contact_email,
            client_address=snapshot.get("client_address") or body.client_address,
            equipment_category=body.equipment_category,
            notes=body.notes,
            survey_note=body.survey_note,
            status="draft",
            current_stage="S1_SALES_COLLECT",
            created_by=current_user.id,
            sales_owner_id=body.sales_owner_id or current_user.id,
        )
        self._session.add(quotation)
        await self._session.flush()
        await self._session.refresh(quotation)

        await self._repo.add_transition({
            "quotation_id": quotation.id,
            "from_stage": None,
            "to_stage": "S1_SALES_COLLECT",
            "actor_id": current_user.id,
            "action": "create",
            "note": "Tạo hồ sơ báo giá mới",
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.created",
            entity_type="quotation",
            entity_id=quotation.id,
            new_value={"quote_number": quote_number},
        )

        logger.info(f"Quotation {quote_number} created by user {current_user.id}")
        return await _enrich_quotation(quotation, self._user_repo)

    async def get_quotation(
        self, quotation_id: uuid.UUID
    ) -> QuotationPublic:
        q = await self._repo.get_or_404(quotation_id)
        return await _enrich_quotation(q, self._user_repo)

    async def list_client_companies(self, current_user: User) -> list[str]:
        return await self._repo.list_distinct_companies(current_user.company_id)

    async def list_client_company_profiles(
        self, current_user: User
    ) -> list[QuotationCompanyProfilePublic]:
        """Return latest remembered form values for each client company."""
        rows = await self._repo.list_company_profiles(current_user.company_id)
        return [
            QuotationCompanyProfilePublic(
                client_company_name=row.client_company_name,
                client_contact_name=row.client_contact_name,
                client_contact_title=row.client_contact_title,
                client_contact_phone=row.client_contact_phone,
                client_contact_email=row.client_contact_email,
                client_address=row.client_address,
                notes=row.notes,
                survey_note=row.survey_note,
                equipment_category=row.equipment_category,
            )
            for row in rows
        ]

    async def list_quotations(
        self,
        current_user: User,
        *,
        status: str | None = None,
        current_stage: str | None = None,
        outcome: str | None = None,
        equipment_category: str | None = None,
        client_company_name: str | None = None,
        sales_owner_id: uuid.UUID | None = None,
        date_from=None,
        date_to=None,
        skip: int = 0,
        limit: int = 50,
    ) -> QuotationsPublic:
        rows, total = await self._repo.list_with_filters(
            company_id=current_user.company_id,
            status=status,
            current_stage=current_stage,
            outcome=outcome,
            equipment_category=equipment_category,
            client_company_name=client_company_name,
            sales_owner_id=sales_owner_id,
            date_from=date_from,
            date_to=date_to,
            skip=skip,
            limit=limit,
        )
        enriched = await _enrich_quotations_batch(list(rows), self._user_repo)
        return QuotationsPublic(data=enriched, count=total)

    async def update_quotation(
        self,
        quotation_id: uuid.UUID,
        body: QuotationUpdate,
        current_user: User,
    ) -> QuotationPublic:
        q = await self._repo.get_or_404(quotation_id)
        if q.current_stage == "S9_CLOSED":
            raise HTTPException(422, "Không thể chỉnh sửa hồ sơ đã đóng.")

        update_data = body.model_dump(exclude_unset=True)

        # When (re)linking a customer company, refresh the text snapshot so the
        # quotation's client fields stay consistent with the directory.
        if "client_company_id" in update_data and update_data["client_company_id"] is not None:
            resolved_id, snapshot = await self._resolve_customer_company(
                current_user, update_data["client_company_id"], None
            )
            update_data["client_company_id"] = resolved_id
            update_data.update(snapshot)

        old_data = {k: getattr(q, k) for k in update_data}

        for field, val in update_data.items():
            setattr(q, field, val)
        q.updated_at = _utcnow()

        await self._repo.save(q)
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.updated",
            entity_type="quotation",
            entity_id=q.id,
            old_value=old_data,
            new_value=update_data,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def delete_quotation(
        self, quotation_id: uuid.UUID, current_user: User
    ) -> None:
        q = await self._repo.get_or_404(quotation_id)
        q.is_deleted = True
        q.deleted_at = _utcnow()
        await self._repo.save(q)
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.deleted",
            entity_type="quotation",
            entity_id=q.id,
        )

    # ------------------------------------------------------------------
    # Workflow transitions
    # ------------------------------------------------------------------

    async def submit_survey(
        self,
        quotation_id: uuid.UUID,
        body: QuotationSubmitSurveyRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S1 → S2: KD nộp thông tin khảo sát, chờ BGĐ duyệt."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S1_SALES_COLLECT")

        q.client_contact_name = body.client_contact_name
        q.client_contact_phone = body.client_contact_phone
        q.client_contact_title = body.client_contact_title
        q.client_address = body.client_address

        if body.site_survey_date:
            q.site_survey_date = body.site_survey_date
        q.survey_start_date = body.survey_start_date
        q.survey_end_date = body.survey_end_date

        old_stage = q.current_stage
        q.current_stage = "S2_DIRECTOR_APPROVE_SURVEY"
        q.status = "in_review"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "submit_survey",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.stage_changed",
            entity_type="quotation",
            entity_id=q.id,
            old_value={"stage": old_stage},
            new_value={"stage": q.current_stage},
        )
        await self._notify(
            user_id=q.created_by,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ Giám đốc duyệt khảo sát",
            body=f"Hồ sơ '{q.project_name}' đã được chuyển cho Ban Giám Đốc phê duyệt.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def approve_survey(
        self,
        quotation_id: uuid.UUID,
        body,  # QuotationApproveRequest
        current_user: User,
    ) -> QuotationPublic:
        """S2: BGĐ approve → S3 (KT thiết kế) | reject → S1 (KD chỉnh sửa)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S2_DIRECTOR_APPROVE_SURVEY")

        if body.action == "approve":
            await self._check_delegate_block(quotation_id, "S2_DIRECTOR_APPROVE_SURVEY")
            should_advance = await self._handle_co_approver_flow(quotation_id, "S2_DIRECTOR_APPROVE_SURVEY", current_user)
            if not should_advance:
                return await _enrich_quotation(q, self._user_repo)

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S3_TECH_DESIGN"
            q.status = "active"
            action_label = "approve_survey"
            notify_user = q.technical_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Kỹ Thuật cần thiết kế"
            notify_body = f"Giám đốc đã duyệt khảo sát. Hồ sơ '{q.project_name}' chờ thiết kế."
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = self._resolve_reject_stage("S2_DIRECTOR_APPROVE_SURVEY", "S1_SALES_COLLECT", body.target_stage)
            q.status = "active"
            action_label = "reject_survey"
            notify_user = q.sales_owner_id
            notify_title = f"[{q.quote_number}] Giám đốc yêu cầu bổ sung khảo sát"
            notify_body = f"Hồ sơ '{q.project_name}' cần bổ sung thông tin khảo sát. Lý do: {body.note}"

        q.updated_at = _utcnow()
        await self._repo.save(q)
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": action_label,
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.survey_{action_label}d",
            entity_type="quotation",
            entity_id=q.id,
            old_value={"stage": old_stage},
            new_value={"stage": q.current_stage},
        )
        await self._notify(
            user_id=notify_user,
            notif_type="quotation_stage_changed",
            title=notify_title,
            body=notify_body,
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def submit_design(
        self,
        quotation_id: uuid.UUID,
        body: QuotationSubmitDesignRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S3 → S3B: KT nộp thiết kế, chuyển sang bóc tách khối lượng."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S3_TECH_DESIGN")

        attachments = await self._repo.get_attachments(q.id)
        s3_files = [a for a in attachments if a.stage_uploaded == "S3_TECH_DESIGN"]
        if not s3_files:
            raise HTTPException(
                422, "Phải upload ít nhất 1 file thiết kế trước khi nộp."
            )

        old_stage = q.current_stage
        q.current_stage = "S3B_BOC_TACH"
        q.status = "active"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "submit_design",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.design_submitted",
            entity_type="quotation",
            entity_id=q.id,
            old_value={"stage": old_stage},
            new_value={"stage": q.current_stage},
        )
        await self._notify(
            user_id=q.technical_owner_id or q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Thiết kế xong — cần bóc tách khối lượng",
            body=f"Hồ sơ '{q.project_name}' chuyển sang bước bóc tách khối lượng.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def submit_boc_tach(
        self,
        quotation_id: uuid.UUID,
        body,  # QuotationSubmitBocTachRequest
        current_user: User,
    ) -> QuotationPublic:
        """S3B → S4: KT hoàn thành bóc tách khối lượng, nộp BGĐ duyệt thiết kế."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S3B_BOC_TACH")

        old_stage = q.current_stage
        q.current_stage = "S4_DIRECTOR_APPROVE_DESIGN"
        q.status = "in_review"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "submit_boc_tach",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.boc_tach_submitted",
            entity_type="quotation",
            entity_id=q.id,
            old_value={"stage": old_stage},
            new_value={"stage": q.current_stage},
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ BGĐ duyệt thiết kế & bóc tách",
            body=f"KT đã hoàn thành bóc tách khối lượng '{q.project_name}'. Chờ Ban Giám Đốc phê duyệt.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def approve_design(
        self,
        quotation_id: uuid.UUID,
        body,  # QuotationApproveRequest
        current_user: User,
    ) -> QuotationPublic:
        """S4: BGĐ approve → S5 (VT định giá) | reject → S3 (KT chỉnh sửa)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S4_DIRECTOR_APPROVE_DESIGN")

        if body.action == "approve":
            await self._check_delegate_block(quotation_id, "S4_DIRECTOR_APPROVE_DESIGN")
            should_advance = await self._handle_co_approver_flow(quotation_id, "S4_DIRECTOR_APPROVE_DESIGN", current_user)
            if not should_advance:
                return await _enrich_quotation(q, self._user_repo)

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S5_PROCUREMENT_PRICING"
            q.status = "active"
            action_label = "approve_design"
            notify_user = q.procurement_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Vật Tư cần báo đơn giá"
            notify_body = f"Giám đốc đã duyệt thiết kế. Hồ sơ '{q.project_name}' chờ báo đơn giá."
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = self._resolve_reject_stage("S4_DIRECTOR_APPROVE_DESIGN", "S3B_BOC_TACH", body.target_stage)
            q.status = "active"
            action_label = "reject_design"
            notify_user = q.technical_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Giám đốc yêu cầu chỉnh lại thiết kế"
            notify_body = f"Hồ sơ '{q.project_name}' cần chỉnh lại thiết kế. Lý do: {body.note}"

        q.updated_at = _utcnow()
        await self._repo.save(q)
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": action_label,
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.design_{action_label}d",
            entity_type="quotation",
            entity_id=q.id,
        )
        await self._notify(
            user_id=notify_user,
            notif_type="quotation_stage_changed",
            title=notify_title,
            body=notify_body,
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def submit_pricing(
        self,
        quotation_id: uuid.UUID,
        body: QuotationSubmitPricingRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S5 → S6: VT xác nhận đã điền đủ đơn giá."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S5_PROCUREMENT_PRICING")

        attachments = await self._repo.get_attachments(q.id)
        s5_files = [a for a in attachments if a.stage_uploaded == "S5_PROCUREMENT_PRICING"]
        if not s5_files:
            raise HTTPException(422, "Phải upload file báo giá đã điền trước khi nộp.")

        q.total_contract_value = body.total_contract_value
        old_stage = q.current_stage
        q.current_stage = "S6_SALES_FINALIZE"
        q.status = "active"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "submit_pricing",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.pricing_submitted",
            entity_type="quotation",
            entity_id=q.id,
            new_value={"total_contract_value": q.total_contract_value},
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Cần hoàn thiện hợp đồng chào giá",
            body=f"Vật Tư đã nộp bảng đơn giá cho '{q.project_name}'. Tổng giá trị: {q.total_contract_value:,.0f} {q.currency}.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def finalize(
        self,
        quotation_id: uuid.UUID,
        body: QuotationFinalizeRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S6 → S7: KD upload file hợp đồng chào giá, nộp GĐ duyệt."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S6_SALES_FINALIZE")

        attachments = await self._repo.get_attachments(q.id)
        s6_files = [a for a in attachments if a.stage_uploaded == "S6_SALES_FINALIZE"]
        if not s6_files:
            raise HTTPException(422, "Phải upload ít nhất 1 file hợp đồng chào giá trước khi nộp.")

        old_stage = q.current_stage
        q.current_stage = "S7_DIRECTOR_APPROVE_QUOTE"
        q.status = "in_review"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "finalize",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.finalized",
            entity_type="quotation",
            entity_id=q.id,
            new_value={"total_contract_value": q.total_contract_value},
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ Giám đốc duyệt chào giá",
            body=f"Kinh doanh đã hoàn thiện hợp đồng chào giá '{q.project_name}'. Chờ phê duyệt.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def approve_final(
        self,
        quotation_id: uuid.UUID,
        body,  # QuotationApproveRequest
        current_user: User,
    ) -> QuotationPublic:
        """S7: BGĐ duyệt báo giá cuối → S8 | reject → S6 (KD chỉnh lại)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S7_DIRECTOR_APPROVE_QUOTE")

        if body.action == "approve":
            await self._check_delegate_block(quotation_id, "S7_DIRECTOR_APPROVE_QUOTE")
            should_advance = await self._handle_co_approver_flow(quotation_id, "S7_DIRECTOR_APPROVE_QUOTE", current_user)
            if not should_advance:
                return await _enrich_quotation(q, self._user_repo)

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S8_SENT_TO_CLIENT"
            q.status = "active"
            action_label = "approve_final"
            notify_title = f"[{q.quote_number}] Chào giá đã được duyệt — sẵn sàng gửi khách hàng"
            notify_body = f"Giám đốc đã phê duyệt chào giá '{q.project_name}'. Có thể gửi cho khách hàng."
            await self._snapshot(q, current_user.id, "initial_approval")
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = self._resolve_reject_stage("S7_DIRECTOR_APPROVE_QUOTE", "S6_SALES_FINALIZE", body.target_stage)
            q.status = "active"
            action_label = "reject_final"
            notify_title = f"[{q.quote_number}] Giám đốc yêu cầu chỉnh lại chào giá"
            notify_body = f"Hồ sơ '{q.project_name}' cần chỉnh lại chào giá. Lý do: {body.note}"

        q.updated_at = _utcnow()
        await self._repo.save(q)
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": action_label,
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.final_{action_label}d",
            entity_type="quotation",
            entity_id=q.id,
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=notify_title,
            body=notify_body,
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def send_to_client(
        self,
        quotation_id: uuid.UUID,
        body: QuotationSendToClientRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S8: Ghi nhận đã gửi cho khách hàng."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8_SENT_TO_CLIENT")

        q.sent_to_client_at = datetime.utcnow()  # naive UTC — column is TIMESTAMP WITHOUT TIME ZONE
        q.status = "sent"
        if body.valid_until:
            q.valid_until = body.valid_until
        if body.client_response_deadline:
            q.client_response_deadline = body.client_response_deadline
        q.updated_at = _utcnow()
        await self._repo.save(q)

        parts: list[str] = []
        if q.valid_until:
            parts.append(f"- Hiệu lực báo giá đến: {q.valid_until.strftime('%d/%m/%Y')}")
        if q.client_response_deadline:
            parts.append(
                f"- Hạn phản hồi khách hàng: {q.client_response_deadline.strftime('%d/%m/%Y')}"
            )
        if body.note:
            parts.append("")
            parts.append(body.note)
        composed_note = "\n".join(parts).strip() if parts else "Đã ghi nhận gửi báo giá cho khách hàng"

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S8_SENT_TO_CLIENT",
            "actor_id": current_user.id,
            "action": "send_to_client",
            "note": composed_note,
        })
        await self._snapshot(q, current_user.id, "sent_to_client")
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.sent_to_client",
            entity_type="quotation",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def submit_negotiation(
        self,
        quotation_id: uuid.UUID,
        body: QuotationSubmitNegotiationRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S8 → S8B: KD ghi nhận thương lượng của khách và trình GĐ duyệt."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8_SENT_TO_CLIENT")

        old_stage = q.current_stage
        q.current_stage = "S8B_NEGOTIATION_REVIEW"
        q.status = "negotiating"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": "submit_negotiation",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.negotiation_submitted",
            entity_type="quotation",
            entity_id=q.id,
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ Giám đốc duyệt thương lượng",
            body=f"Kinh doanh trình thương lượng cho '{q.project_name}'. Nội dung: {body.note}",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def approve_negotiation(
        self,
        quotation_id: uuid.UUID,
        body,  # QuotationApproveRequest
        current_user: User,
    ) -> QuotationPublic:
        """S8B: GĐ duyệt thương lượng → S6 (KD cập nhật bảng giá) | reject → S8 (tiếp tục chờ)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8B_NEGOTIATION_REVIEW")

        if body.action == "approve":
            await self._check_delegate_block(quotation_id, "S8B_NEGOTIATION_REVIEW")
            should_advance = await self._handle_co_approver_flow(quotation_id, "S8B_NEGOTIATION_REVIEW", current_user)
            if not should_advance:
                return await _enrich_quotation(q, self._user_repo)

        old_stage = q.current_stage
        if body.action == "approve":
            await self._snapshot(q, current_user.id, "negotiation_approved")
            q.current_stage = "S6_SALES_FINALIZE"
            q.status = "active"
            action_label = "approve_negotiation"
            notify_title = f"[{q.quote_number}] Giám đốc đồng ý điều chỉnh giá"
            notify_body = f"Hồ sơ '{q.project_name}' quay lại hoàn thiện bảng giá mới."
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi không đồng ý.")
            q.current_stage = self._resolve_reject_stage("S8B_NEGOTIATION_REVIEW", "S8_SENT_TO_CLIENT", body.target_stage)
            q.status = "sent"
            action_label = "reject_negotiation"
            notify_title = f"[{q.quote_number}] Giám đốc chưa đồng ý điều chỉnh giá"
            notify_body = f"Hồ sơ '{q.project_name}' tiếp tục chờ phản hồi khách. Lý do: {body.note}"

        q.updated_at = _utcnow()
        await self._repo.save(q)
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": old_stage,
            "to_stage": q.current_stage,
            "actor_id": current_user.id,
            "action": action_label,
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.negotiation_{body.action}d",
            entity_type="quotation",
            entity_id=q.id,
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=notify_title,
            body=notify_body,
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def close_quotation(
        self,
        quotation_id: uuid.UUID,
        body: QuotationCloseRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S8 → S9: Đóng hồ sơ (won hoặc lost)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8_SENT_TO_CLIENT")

        if q.sent_to_client_at is None and q.status not in ("sent", "negotiating"):
            raise HTTPException(422, "Phải ghi nhận đã gửi khách hàng trước khi đóng hồ sơ.")

        if body.outcome == "lost" and not body.lost_reason_category:
            raise HTTPException(
                422, "Phải chọn lý do thua khi đóng hồ sơ thất bại."
            )

        q.outcome = body.outcome
        q.lost_reason_category = body.lost_reason_category
        q.lost_reason_detail = body.lost_reason_detail
        q.current_stage = "S9_CLOSED"
        q.status = "closed_won" if body.outcome == "won" else "closed_lost"
        q.updated_at = _utcnow()

        if body.outcome == "won":
            project = await self._create_project_from_quotation(
                q, current_user, extra_role_ids=body.extra_role_ids or []
            )
            q.won_project_id = project.id

        await self._repo.save(q)

        if body.outcome == "won":
            from app.models.contract import ContractCreate
            from app.services.contract_service import ContractService

            total_value = float(q.total_contract_value or 0.0)
            contract_body = ContractCreate(
                quotation_id=q.id,
                project_id=q.won_project_id,
                contract_date=date.today(),
                total_value=total_value,
                currency=q.currency,
                notes=f"Tạo tự động từ báo giá {q.quote_number}",
            )
            try:
                await ContractService(self._session).create_contract(contract_body, current_user)
            except HTTPException as exc:
                if getattr(exc, "status_code", None) != 409:
                    raise

        close_action = "close_won" if body.outcome == "won" else "close_lost"
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S9_CLOSED",
            "actor_id": current_user.id,
            "action": close_action,
            "note": body.note or f"Kết quả: {body.outcome}",
        })
        await self._audit.write(
            actor_id=current_user.id,
            action=f"quotation.closed.{body.outcome}",
            entity_type="quotation",
            entity_id=q.id,
            new_value={
                "outcome": body.outcome,
                "lost_reason_category": body.lost_reason_category,
            },
        )
        return await _enrich_quotation(q, self._user_repo)

    async def _create_project_from_quotation(
        self,
        quotation: Quotation,
        current_user: User,
        extra_role_ids: list[uuid.UUID] | None = None,
    ) -> Project:
        """Auto-create a Project when a quotation is won.

        Auto-adds all company members with role level 1 (BGĐ) and level 2
        (Manager) as project members, plus any extra roles specified.
        Admin roles (is_system=True + name='admin') are excluded.
        """
        from datetime import date as _date

        from sqlalchemy import select
        from sqlalchemy.orm import joinedload

        from app.models.org import ProjectMemberRole, Role, UserCompanyRole

        project = Project(
            company_id=quotation.company_id,
            name=quotation.project_name,
            code=f"PRJ-{quotation.quote_number}",
            description=f"Dự án tạo từ báo giá {quotation.quote_number} - {quotation.client_company_name}",
            start_date=_date.today(),
            end_date=_date.today().replace(year=_date.today().year + 1),
            status="planning",
            pm_id=quotation.sales_owner_id,
            created_by=current_user.id,
        )
        self._session.add(project)
        await self._session.flush()
        await self._session.refresh(project)

        # Query tất cả UserCompanyRole trong công ty, join Role để lấy level
        stmt = (
            select(UserCompanyRole)
            .join(Role, Role.id == UserCompanyRole.role_id)
            .where(
                UserCompanyRole.company_id == quotation.company_id,
                Role.name != "admin",  # exclude admin
            )
            .options(joinedload(UserCompanyRole.role))
        )
        result = await self._session.execute(stmt)
        all_ucr: list[UserCompanyRole] = list(result.scalars().unique().all())

        extra_set = set(extra_role_ids or [])
        seen: set[tuple] = set()  # (user_id, role_id) để tránh duplicate

        members_to_add: list[ProjectMemberRole] = []
        for ucr in all_ucr:
            role = ucr.role
            if role.level <= 2 or role.id in extra_set:
                key = (ucr.user_id, ucr.role_id)
                if key not in seen:
                    seen.add(key)
                    members_to_add.append(
                        ProjectMemberRole(
                            project_id=project.id,
                            user_id=ucr.user_id,
                            role_id=ucr.role_id,
                        )
                    )

        if members_to_add:
            self._session.add_all(members_to_add)
            await self._session.flush()
            logger.info(
                f"Project {project.code}: auto-added {len(members_to_add)} members "
                f"(level 1&2 + {len(extra_set)} extra roles)"
            )

        return project

    # ------------------------------------------------------------------
    # Stage history
    # ------------------------------------------------------------------

    async def list_history(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationStageTransitionPublic]:
        await self._repo.get_or_404(quotation_id)
        transitions = await self._repo.get_transitions(quotation_id)
        actor_ids = list({t.actor_id for t in transitions if t.actor_id})
        actors = {u.id: u for u in await self._user_repo.list_by_ids(actor_ids)}
        result = []
        for t in transitions:
            actor = actors.get(t.actor_id)
            row = QuotationStageTransitionPublic.model_validate(t, from_attributes=True)
            row.actor_name = actor.full_name if actor else None
            row.from_stage_label = STAGE_LABELS.get(t.from_stage) if t.from_stage else None
            row.to_stage_label = STAGE_LABELS.get(t.to_stage)
            row.action_label = ACTION_LABELS.get(t.action)
            result.append(row)
        return result

    # ------------------------------------------------------------------
    # Negotiation logs
    # ------------------------------------------------------------------

    async def list_negotiations(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationNegotiationLogPublic]:
        await self._repo.get_or_404(quotation_id)
        logs = await self._repo.get_negotiations(quotation_id)
        user_ids = list({log.logged_by for log in logs if log.logged_by})
        users = {u.id: u for u in await self._user_repo.list_by_ids(user_ids)}
        result = []
        for log in logs:
            user = users.get(log.logged_by)
            row = QuotationNegotiationLogPublic.model_validate(log, from_attributes=True)
            row.logged_by_name = user.full_name if user else None
            result.append(row)
        return result

    async def add_negotiation_log(
        self,
        quotation_id: uuid.UUID,
        body: QuotationNegotiationLogCreate,
        current_user: User,
    ) -> QuotationNegotiationLogPublic:
        await self._repo.get_or_404(quotation_id)
        log = await self._repo.add_negotiation({
            **body.model_dump(),
            "quotation_id": quotation_id,
            "logged_by": current_user.id,
        })
        row = QuotationNegotiationLogPublic.model_validate(log, from_attributes=True)
        row.logged_by_name = current_user.full_name
        return row

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def list_attachments(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationAttachmentPublic]:
        await self._repo.get_or_404(quotation_id)
        atts = await self._repo.get_attachments(quotation_id)
        user_ids = list({att.uploaded_by for att in atts if att.uploaded_by})
        users = {u.id: u for u in await self._user_repo.list_by_ids(user_ids)}
        result = []
        for att in atts:
            user = users.get(att.uploaded_by)
            row = QuotationAttachmentPublic.model_validate(att, from_attributes=True)
            row.uploaded_by_name = user.full_name if user else None
            result.append(row)
        return result

    async def add_attachment(
        self,
        quotation_id: uuid.UUID,
        body: QuotationAttachmentCreate,
        current_user: User,
    ) -> QuotationAttachmentPublic:
        q = await self._repo.get_or_404(quotation_id)
        att = await self._repo.add_attachment({
            **body.model_dump(),
            "quotation_id": quotation_id,
            "uploaded_by": current_user.id,
            "stage_uploaded": q.current_stage,
        })
        row = QuotationAttachmentPublic.model_validate(att, from_attributes=True)
        row.uploaded_by_name = current_user.full_name
        return row

    async def delete_attachment(
        self,
        quotation_id: uuid.UUID,
        att_id: uuid.UUID,
        current_user: User,
    ) -> None:
        await self._repo.get_or_404(quotation_id)
        att = await self._repo.get_attachment_or_404(quotation_id, att_id)
        await self._repo.delete_attachment(att)

    # ------------------------------------------------------------------
    # Versions
    # ------------------------------------------------------------------

    async def list_versions(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationVersionPublic]:
        await self._repo.get_or_404(quotation_id)
        versions = await self._repo.get_versions(quotation_id)
        user_ids = list({v.created_by for v in versions if v.created_by})
        users = {u.id: u for u in await self._user_repo.list_by_ids(user_ids)}
        result = []
        for v in versions:
            user = users.get(v.created_by)
            row = QuotationVersionPublic.model_validate(v, from_attributes=True)
            row.created_by_name = user.full_name if user else None
            result.append(row)
        return result

    async def get_version(
        self, quotation_id: uuid.UUID, version_id: uuid.UUID
    ) -> QuotationVersionPublic:
        v = await self._repo.get_version_or_404(quotation_id, version_id)
        user = await self._user_repo.get_by_id(v.created_by)
        row = QuotationVersionPublic.model_validate(v, from_attributes=True)
        row.created_by_name = user.full_name if user else None
        return row

    async def create_version_snapshot(
        self,
        quotation_id: uuid.UUID,
        current_user: User,
        reason: str = "manual",
    ) -> QuotationVersionPublic:
        q = await self._repo.get_or_404(quotation_id)
        await self._snapshot(q, current_user.id, reason)
        versions = await self._repo.get_versions(quotation_id)
        latest = versions[-1]
        row = QuotationVersionPublic.model_validate(latest, from_attributes=True)
        row.created_by_name = current_user.full_name
        return row

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------

    async def report_summary(
        self,
        current_user: User,
        date_from=None,
        date_to=None,
        equipment_category: str | None = None,
        client_company_name: str | None = None,
    ) -> QuotationReportSummary:
        data = await self._repo.get_report_summary(
            company_id=current_user.company_id,
            date_from=date_from,
            date_to=date_to,
            equipment_category=equipment_category,
            client_company_name=client_company_name,
        )
        return QuotationReportSummary(**data)

    async def report_by_client(
        self, current_user: User, date_from=None, date_to=None
    ) -> list[QuotationByClientRow]:
        rows = await self._repo.get_by_client_report(
            company_id=current_user.company_id,
            date_from=date_from,
            date_to=date_to,
        )
        return [QuotationByClientRow(**r) for r in rows]

    async def report_by_equipment(
        self, current_user: User, date_from=None, date_to=None
    ) -> list[QuotationByEquipmentRow]:
        rows = await self._repo.get_by_equipment_report(
            company_id=current_user.company_id,
            date_from=date_from,
            date_to=date_to,
        )
        return [QuotationByEquipmentRow(**r) for r in rows]

    async def report_lost_analysis(
        self, current_user: User, date_from=None, date_to=None
    ) -> list[QuotationLostReasonRow]:
        rows = await self._repo.get_lost_reason_report(
            company_id=current_user.company_id,
            date_from=date_from,
            date_to=date_to,
        )
        return [QuotationLostReasonRow(**r) for r in rows]

    async def my_pending_quotations(self, current_user: User) -> list[QuotationPublic]:
        """Return quotations where the current user is expected to take action.

        Resolves the user's permissions once, maps them to actionable stages
        (derived from STAGE_TRANSITIONS), then fetches matching quotations.
        """
        from sqlalchemy import select as sa_select

        from app.models.org import Permission, Role, RolePermission
        from app.shared.permission import (
            DIRECTOR_ROLE_NAMES,
            get_user_role_ids,
        )

        # Build permission_code → stages mapping from the state machine
        perm_to_stages: dict[str, list[str]] = {}
        for stage, transitions in STAGE_TRANSITIONS.items():
            for _next, perm, _action in transitions:
                perm_to_stages.setdefault(perm, []).append(stage)

        actionable_stages: set[str] = set()

        if current_user.is_superuser:
            actionable_stages = set(STAGE_TRANSITIONS.keys()) - {"S9_CLOSED"}
        else:
            role_ids = await get_user_role_ids(
                self._session,
                current_user.id,
                company_id=current_user.company_id,
            )
            if role_ids:
                role_result = await self._session.execute(
                    sa_select(Role).where(Role.id.in_(role_ids))  # type: ignore[arg-type]
                )
                roles = role_result.scalars().all()

                is_director = any(
                    r.level == 1 or r.name in DIRECTOR_ROLE_NAMES for r in roles
                )
                if is_director:
                    actionable_stages = set(STAGE_TRANSITIONS.keys()) - {"S9_CLOSED"}
                else:
                    perm_result = await self._session.execute(
                        sa_select(Permission)
                        .join(RolePermission, RolePermission.permission_id == Permission.id)
                        .where(RolePermission.role_id.in_(role_ids))  # type: ignore[arg-type]
                    )
                    user_perm_codes = {p.code for p in perm_result.scalars().all()}
                    for perm_code, stages in perm_to_stages.items():
                        if perm_code in user_perm_codes:
                            actionable_stages.update(stages)

        if not actionable_stages:
            return []

        rows = await self._repo.list_by_stages(
            company_id=current_user.company_id,
            stages=list(actionable_stages),
        )
        return await _enrich_quotations_batch(list(rows), self._user_repo)
