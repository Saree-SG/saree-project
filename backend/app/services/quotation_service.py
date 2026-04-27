"""
Quotation service — business logic and state machine.

Orchestrates: stage transitions, line item recalculation,
Notification dispatch, AuditLog writing, and Project creation on win.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.project import Project
from app.models.quotation import (
    STAGE_LABELS,
    STAGE_TRANSITIONS,
    Quotation,
    QuotationAttachment,
    QuotationAttachmentCreate,
    QuotationAttachmentPublic,
    QuotationByClientRow,
    QuotationByEquipmentRow,
    QuotationCloseRequest,
    QuotationCreate,
    QuotationFinalizeRequest,
    QuotationLineItem,
    QuotationLineItemCreate,
    QuotationLineItemPriceUpdate,
    QuotationLineItemPublic,
    QuotationLineItemSalePriceUpdate,
    QuotationLineItemUpdate,
    QuotationLostReasonRow,
    QuotationNegotiateRequest,
    QuotationRequestRevisionRequest,
    QuotationNegotiationLog,
    QuotationNegotiationLogCreate,
    QuotationNegotiationLogPublic,
    QuotationPublic,
    QuotationReportSummary,
    QuotationSendToClientRequest,
    QuotationStageTransitionPublic,
    QuotationSubmitDesignRequest,
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
    if stage in ("S8_SENT_TO_CLIENT",):
        return "sent"
    if stage in ("S7_DIRECTOR_APPROVE_QUOTE",):
        return "in_review"
    if stage in ("S2_DIRECTOR_APPROVE_SURVEY", "S4_DIRECTOR_APPROVE_DESIGN"):
        return "in_review"
    return "active"


# ---------------------------------------------------------------------------
# Helper: build QuotationPublic with owner names
# ---------------------------------------------------------------------------

async def _enrich_quotation(
    quotation: Quotation, user_repo: UserRepository
) -> QuotationPublic:
    """Attach owner display names to the response schema."""
    sales_name: str | None = None
    tech_name: str | None = None
    proc_name: str | None = None

    if quotation.sales_owner_id:
        u = await user_repo.get_by_id(quotation.sales_owner_id)
        sales_name = u.full_name if u else None
    if quotation.technical_owner_id:
        u = await user_repo.get_by_id(quotation.technical_owner_id)
        tech_name = u.full_name if u else None
    if quotation.procurement_owner_id:
        u = await user_repo.get_by_id(quotation.procurement_owner_id)
        proc_name = u.full_name if u else None

    data = QuotationPublic.model_validate(
        quotation, from_attributes=True
    )
    data.sales_owner_name = sales_name
    data.technical_owner_name = tech_name
    data.procurement_owner_name = proc_name
    data.stage_label = STAGE_LABELS.get(quotation.current_stage)
    return data


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
        notif = Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            body=body,
            entity_type="quotation",
            entity_id=entity_id,
        )
        self._session.add(notif)

    async def _require_stage(self, quotation: Quotation, *stages: str) -> None:
        if quotation.current_stage not in stages:
            expected = " hoặc ".join(STAGE_LABELS.get(s, s) for s in stages)
            raise HTTPException(
                status_code=422,
                detail=f"Hồ sơ đang ở giai đoạn '{STAGE_LABELS.get(quotation.current_stage)}', "
                       f"cần ở '{expected}' để thực hiện thao tác này.",
            )

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

    def _recalculate_totals(self, quotation: Quotation, items: list[QuotationLineItem]) -> None:
        """Recompute cost_total per item and quotation totals."""
        cost_sum = 0.0
        for item in items:
            if item.cost_unit_price is not None:
                item.cost_total = round(item.quantity * item.cost_unit_price, 2)
                cost_sum += item.cost_total
                if quotation.price_coefficient is not None:
                    item.sale_unit_price = round(
                        item.cost_unit_price * quotation.price_coefficient, 2
                    )
                    item.sale_total = round(
                        item.quantity * item.sale_unit_price, 2
                    )

        quotation.total_cost_price = round(cost_sum, 2) if cost_sum else None
        if quotation.price_coefficient and quotation.total_cost_price is not None:
            quotation.total_sale_price = round(
                quotation.total_cost_price * quotation.price_coefficient, 2
            )

    async def _snapshot(
        self,
        quotation: Quotation,
        actor_id: uuid.UUID,
        reason: str,
    ) -> None:
        """Create an immutable version snapshot."""
        items = await self._repo.get_line_items(quotation.id)
        ver_num = await self._repo.next_version_number(quotation.id)
        await self._repo.add_version({
            "quotation_id": quotation.id,
            "version_number": ver_num,
            "snapshot_data": {
                "line_items": [
                    {
                        "description": i.description,
                        "unit": i.unit,
                        "quantity": i.quantity,
                        "cost_unit_price": i.cost_unit_price,
                        "cost_total": i.cost_total,
                        "sale_unit_price": i.sale_unit_price,
                        "sale_total": i.sale_total,
                    }
                    for i in items
                ],
                "total_cost_price": quotation.total_cost_price,
                "total_sale_price": quotation.total_sale_price,
                "price_coefficient": quotation.price_coefficient,
            },
            "created_by": actor_id,
            "reason": reason,
        })

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_quotation(
        self, body: QuotationCreate, current_user: User
    ) -> QuotationPublic:
        from datetime import date as _date

        year = _date.today().year
        quote_number = await self._repo.next_quote_number(year)

        quotation = Quotation(
            company_id=current_user.company_id,
            quote_number=quote_number,
            project_name=body.project_name,
            client_company_name=body.client_company_name,
            client_contact_name=body.client_contact_name,
            client_contact_phone=body.client_contact_phone,
            client_contact_email=body.client_contact_email,
            client_address=body.client_address,
            equipment_category=body.equipment_category,
            notes=body.notes,
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
            "action": "submit",
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
        enriched = [await _enrich_quotation(r, self._user_repo) for r in rows]
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

        if body.site_survey_date:
            q.site_survey_date = body.site_survey_date

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
            "action": "submit",
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
        # Notify directors — we notify the sales owner's manager; for simplicity
        # we emit a company-wide notification type that the frontend filters.
        await self._notify(
            user_id=q.created_by,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ BGĐ duyệt khảo sát",
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

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S3_TECH_DESIGN"
            q.status = "active"
            action_label = "approve"
            notify_user = q.technical_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Kỹ Thuật cần thiết kế"
            notify_body = f"BGĐ đã duyệt khảo sát. Hồ sơ '{q.project_name}' chờ thiết kế."
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = "S1_SALES_COLLECT"
            q.status = "active"
            action_label = "reject"
            notify_user = q.sales_owner_id
            notify_title = f"[{q.quote_number}] BGĐ yêu cầu chỉnh sửa"
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
        """S3 → S4: KT nộp thiết kế, chờ BGĐ duyệt phương án."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S3_TECH_DESIGN")

        items = await self._repo.get_line_items(q.id)
        if not items:
            raise HTTPException(
                422, "Phải có ít nhất 1 hạng mục trong bảng chào giá trước khi nộp thiết kế."
            )

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
            "action": "submit",
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
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ BGĐ duyệt phương án thiết kế",
            body=f"KT đã nộp thiết kế cho '{q.project_name}'. Chờ Ban Giám Đốc phê duyệt.",
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

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S5_PROCUREMENT_PRICING"
            q.status = "active"
            action_label = "approve"
            notify_user = q.procurement_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] Phòng Vật Tư cần điền đơn giá"
            notify_body = f"BGĐ đã duyệt phương án thiết kế. Hồ sơ '{q.project_name}' chờ định giá."
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = "S3_TECH_DESIGN"
            q.status = "active"
            action_label = "reject"
            notify_user = q.technical_owner_id or q.sales_owner_id
            notify_title = f"[{q.quote_number}] BGĐ yêu cầu điều chỉnh thiết kế"
            notify_body = f"Hồ sơ '{q.project_name}' cần điều chỉnh thiết kế. Lý do: {body.note}"

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

        items = list(await self._repo.get_line_items(q.id))
        unpriced = [i for i in items if i.cost_unit_price is None]
        if unpriced:
            raise HTTPException(
                422,
                f"Còn {len(unpriced)} hạng mục chưa có đơn giá. Vui lòng điền đầy đủ trước khi nộp.",
            )

        self._recalculate_totals(q, items)
        for item in items:
            self._session.add(item)

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
            "action": "submit",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.pricing_submitted",
            entity_type="quotation",
            entity_id=q.id,
            new_value={"total_cost_price": q.total_cost_price},
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Cần hoàn thiện bảng báo giá",
            body=f"Vật Tư đã điền đủ đơn giá cho '{q.project_name}'. Tổng giá mua: {q.total_cost_price:,.0f} {q.currency}.",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def update_item_sale_price(
        self,
        quotation_id: uuid.UUID,
        item_id: uuid.UUID,
        body: QuotationLineItemSalePriceUpdate,
        current_user: User,
    ) -> QuotationLineItemPublic:
        """S6: KD set giá bán cho từng hạng mục (thay thế hoặc bổ sung cho price_coefficient)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S6_SALES_FINALIZE")

        item = await self._repo.get_line_item_or_404(quotation_id, item_id)
        item.sale_unit_price = body.sale_unit_price
        item.sale_total = round(item.quantity * body.sale_unit_price, 2)
        item.updated_at = _utcnow()
        item = await self._repo.save_line_item(item)

        # Cập nhật total_sale_price ngay để KD thấy tổng
        all_items = await self._repo.get_line_items(quotation_id)
        new_total = sum(i.sale_total for i in all_items if i.sale_total is not None)
        q.total_sale_price = round(new_total, 2)
        q.updated_at = _utcnow()
        await self._repo.save(q)

        return QuotationLineItemPublic.model_validate(item, from_attributes=True)

    async def finalize(
        self,
        quotation_id: uuid.UUID,
        body: QuotationFinalizeRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S6 → S7: KD hoàn thiện giá bán, nộp BGĐ duyệt cuối.

        Hai chế độ:
        - price_coefficient được cung cấp: áp hệ số lên toàn bộ item (ghi đè giá đã set thủ công).
        - price_coefficient = None: giữ nguyên sale_unit_price từng item; validate tất cả items có giá.
        """
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S6_SALES_FINALIZE")

        items = list(await self._repo.get_line_items(q.id))

        if body.price_coefficient is not None:
            if body.price_coefficient <= 0:
                raise HTTPException(422, "Hệ số giá phải lớn hơn 0.")
            q.price_coefficient = body.price_coefficient
            self._recalculate_totals(q, items)
        else:
            # Validate tất cả items có sale_unit_price
            missing = [i.description for i in items if i.sale_unit_price is None]
            if missing:
                raise HTTPException(
                    422,
                    f"Các hạng mục chưa có giá bán: {', '.join(missing[:5])}. "
                    "Hãy nhập giá từng hạng mục hoặc cung cấp hệ số giá toàn cục.",
                )
            # Tính lại cost_total và tổng sale
            cost_sum = 0.0
            sale_sum = 0.0
            for item in items:
                if item.cost_unit_price is not None:
                    item.cost_total = round(item.quantity * item.cost_unit_price, 2)
                    cost_sum += item.cost_total
                if item.sale_unit_price is not None:
                    item.sale_total = round(item.quantity * item.sale_unit_price, 2)
                    sale_sum += item.sale_total
            q.total_cost_price = round(cost_sum, 2) if cost_sum else None
            q.total_sale_price = round(sale_sum, 2)

        for item in items:
            self._session.add(item)

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
            "action": "submit",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.finalized",
            entity_type="quotation",
            entity_id=q.id,
            new_value={
                "price_coefficient": q.price_coefficient,
                "total_sale_price": q.total_sale_price,
            },
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Chờ BGĐ duyệt báo giá",
            body=f"Báo giá '{q.project_name}' hoàn thiện. Tổng giá bán: {q.total_sale_price:,.0f} {q.currency}. Chờ phê duyệt.",
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

        old_stage = q.current_stage
        if body.action == "approve":
            q.current_stage = "S8_SENT_TO_CLIENT"
            q.status = "active"
            action_label = "approve"
            notify_title = f"[{q.quote_number}] Báo giá đã được duyệt — sẵn sàng gửi khách hàng"
            notify_body = f"BGĐ đã phê duyệt báo giá '{q.project_name}'. Có thể gửi cho khách hàng."
            # Snapshot
            await self._snapshot(q, current_user.id, "initial_approval")
        else:
            if not body.note:
                raise HTTPException(422, "Phải điền lý do khi từ chối phê duyệt.")
            q.current_stage = "S6_SALES_FINALIZE"
            q.status = "active"
            action_label = "reject"
            notify_title = f"[{q.quote_number}] BGĐ yêu cầu điều chỉnh báo giá"
            notify_body = f"Hồ sơ '{q.project_name}' cần điều chỉnh lại báo giá. Lý do: {body.note}"

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

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S8_SENT_TO_CLIENT",
            "actor_id": current_user.id,
            "action": "submit",
            "note": body.note or "Đã gửi báo giá cho khách hàng",
        })
        # Snapshot when sent
        await self._snapshot(q, current_user.id, "sent_to_client")
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.sent_to_client",
            entity_type="quotation",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def mark_negotiating(
        self,
        quotation_id: uuid.UUID,
        body: QuotationNegotiateRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S8: Chuyển trạng thái sang 'negotiating' để thương lượng giá."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8_SENT_TO_CLIENT")
        if q.status not in ("sent", "negotiating"):
            raise HTTPException(422, "Chỉ có thể thương lượng khi báo giá đã gửi khách hàng.")

        q.status = "negotiating"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S8_SENT_TO_CLIENT",
            "actor_id": current_user.id,
            "action": "negotiate",
            "note": body.note or "Bắt đầu thương lượng giá với khách hàng",
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.negotiating",
            entity_type="quotation",
            entity_id=q.id,
        )
        return await _enrich_quotation(q, self._user_repo)

    async def request_revision(
        self,
        quotation_id: uuid.UUID,
        body: QuotationRequestRevisionRequest,
        current_user: User,
    ) -> QuotationPublic:
        """S8 → S6: Khách yêu cầu điều chỉnh giá → quay lại KD hoàn thiện."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S8_SENT_TO_CLIENT")
        if q.status not in ("sent", "negotiating"):
            raise HTTPException(422, "Chỉ có thể yêu cầu điều chỉnh khi báo giá đã gửi khách hàng.")

        # Snapshot trước khi điều chỉnh
        await self._snapshot(q, current_user.id, "client_revision")

        q.current_stage = "S6_SALES_FINALIZE"
        q.status = "active"
        q.updated_at = _utcnow()
        await self._repo.save(q)

        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S6_SALES_FINALIZE",
            "actor_id": current_user.id,
            "action": "revise",
            "note": body.note,
        })
        await self._audit.write(
            actor_id=current_user.id,
            action="quotation.revision_requested",
            entity_type="quotation",
            entity_id=q.id,
            new_value={"reason": body.note},
        )
        await self._notify(
            user_id=q.sales_owner_id,
            notif_type="quotation_stage_changed",
            title=f"[{q.quote_number}] Khách yêu cầu điều chỉnh giá",
            body=f"Báo giá '{q.project_name}' cần điều chỉnh lại giá bán. Lý do: {body.note}",
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
        await self._repo.add_transition({
            "quotation_id": q.id,
            "from_stage": "S8_SENT_TO_CLIENT",
            "to_stage": "S9_CLOSED",
            "actor_id": current_user.id,
            "action": "submit",
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
    # Line Items
    # ------------------------------------------------------------------

    async def list_line_items(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationLineItemPublic]:
        await self._repo.get_or_404(quotation_id)
        items = await self._repo.get_line_items(quotation_id)
        return [QuotationLineItemPublic.model_validate(i, from_attributes=True) for i in items]

    async def add_line_item(
        self,
        quotation_id: uuid.UUID,
        body: QuotationLineItemCreate,
        current_user: User,
    ) -> QuotationLineItemPublic:
        q = await self._repo.get_or_404(quotation_id)
        if q.current_stage not in ("S3_TECH_DESIGN", "S5_PROCUREMENT_PRICING", "S6_SALES_FINALIZE"):
            raise HTTPException(
                422, "Chỉ có thể thêm hạng mục ở giai đoạn Kỹ Thuật, Vật Tư, hoặc Kinh Doanh hoàn thiện."
            )

        item = await self._repo.add_line_item({
            **body.model_dump(),
            "quotation_id": quotation_id,
            "created_by_role": "technical",
        })
        return QuotationLineItemPublic.model_validate(item, from_attributes=True)

    async def update_line_item(
        self,
        quotation_id: uuid.UUID,
        item_id: uuid.UUID,
        body: QuotationLineItemUpdate,
        current_user: User,
    ) -> QuotationLineItemPublic:
        q = await self._repo.get_or_404(quotation_id)
        item = await self._repo.get_line_item_or_404(quotation_id, item_id)

        for field, val in body.model_dump(exclude_unset=True).items():
            setattr(item, field, val)
        item.updated_at = _utcnow()

        item = await self._repo.save_line_item(item)
        return QuotationLineItemPublic.model_validate(item, from_attributes=True)

    async def update_line_item_price(
        self,
        quotation_id: uuid.UUID,
        item_id: uuid.UUID,
        body: QuotationLineItemPriceUpdate,
        current_user: User,
    ) -> QuotationLineItemPublic:
        """Vật Tư điền đơn giá (only allowed at S5)."""
        q = await self._repo.get_or_404(quotation_id)
        await self._require_stage(q, "S5_PROCUREMENT_PRICING")

        item = await self._repo.get_line_item_or_404(quotation_id, item_id)
        for field, val in body.model_dump(exclude_unset=True).items():
            setattr(item, field, val)

        if item.cost_unit_price is not None:
            item.cost_total = round(item.quantity * item.cost_unit_price, 2)

        item.updated_at = _utcnow()
        item = await self._repo.save_line_item(item)
        return QuotationLineItemPublic.model_validate(item, from_attributes=True)

    async def delete_line_item(
        self,
        quotation_id: uuid.UUID,
        item_id: uuid.UUID,
        current_user: User,
    ) -> None:
        q = await self._repo.get_or_404(quotation_id)
        if q.current_stage not in ("S3_TECH_DESIGN", "S5_PROCUREMENT_PRICING", "S6_SALES_FINALIZE"):
            raise HTTPException(422, "Không thể xóa hạng mục ở giai đoạn này.")
        item = await self._repo.get_line_item_or_404(quotation_id, item_id)
        await self._repo.delete_line_item(item)

    # ------------------------------------------------------------------
    # Stage history
    # ------------------------------------------------------------------

    async def list_history(
        self, quotation_id: uuid.UUID
    ) -> list[QuotationStageTransitionPublic]:
        await self._repo.get_or_404(quotation_id)
        transitions = await self._repo.get_transitions(quotation_id)
        result = []
        for t in transitions:
            actor = await self._user_repo.get_by_id(t.actor_id)
            row = QuotationStageTransitionPublic.model_validate(t, from_attributes=True)
            row.actor_name = actor.full_name if actor else None
            row.from_stage_label = STAGE_LABELS.get(t.from_stage) if t.from_stage else None
            row.to_stage_label = STAGE_LABELS.get(t.to_stage)
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
        result = []
        for log in logs:
            user = await self._user_repo.get_by_id(log.logged_by)
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
        result = []
        for att in atts:
            user = await self._user_repo.get_by_id(att.uploaded_by)
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
        result = []
        for v in versions:
            user = await self._user_repo.get_by_id(v.created_by)
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
        return [await _enrich_quotation(q, self._user_repo) for q in rows]
