"""
Quotation management routes.

All DB operations delegated to QuotationService.
Routes: validate input → call service → return response.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep
from app.core.config import settings
from app.models.quotation import (
    QuotationApproveRequest,
    QuotationAttachmentCreate,
    QuotationAttachmentPublic,
    QuotationByClientRow,
    QuotationByEquipmentRow,
    QuotationCompanyProfilePublic,
    QuotationCloseRequest,
    QuotationCreate,
    QuotationFinalizeRequest,
    QuotationLostReasonRow,
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
from app.services.quotation_service import QuotationService
from app.shared.permission import require_any_permission, require_permission
from app.shared.storage import LocalStorage

router = APIRouter(prefix="/quotations", tags=["quotations"])
_quotation_storage = LocalStorage(
    base_dir=settings.QUOTATION_UPLOAD_DIR,
    static_url_segment="quotation",
)


def _svc(session: AsyncSession) -> QuotationService:
    return QuotationService(session)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=QuotationPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_quotation(
    body: QuotationCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_CREATE")),
) -> QuotationPublic:
    """Phòng Kinh Doanh tạo hồ sơ báo giá mới."""
    return await _svc(session).create_quotation(body, current_user)


@router.get("/companies", response_model=list[str])
async def list_companies(
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[str]:
    """Danh sách tên công ty khách hàng đã từng tạo báo giá (distinct, sorted)."""
    return await _svc(session).list_client_companies(current_user)


@router.get("/company-profiles", response_model=list[QuotationCompanyProfilePublic])
async def list_company_profiles(
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationCompanyProfilePublic]:
    """Danh sách profile công ty khách hàng theo lần cập nhật cuối cùng."""
    return await _svc(session).list_client_company_profiles(current_user)


@router.get("/", response_model=QuotationsPublic)
async def list_quotations(
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
    status_filter: str | None = Query(default=None, alias="status"),
    current_stage: str | None = Query(default=None),
    outcome: str | None = Query(default=None),
    equipment_category: str | None = Query(default=None),
    client_company_name: str | None = Query(default=None),
    sales_owner_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> QuotationsPublic:
    """Danh sách hồ sơ báo giá với filter đầy đủ."""
    return await _svc(session).list_quotations(
        current_user,
        status=status_filter,
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


@router.get("/my-pending", response_model=list[QuotationPublic])
async def my_pending_quotations(
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationPublic]:
    """Danh sách báo giá đang chờ hành động của người dùng hiện tại."""
    return await _svc(session).my_pending_quotations(current_user)


@router.get("/{quotation_id}", response_model=QuotationPublic)
async def get_quotation(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> QuotationPublic:
    """Chi tiết 1 hồ sơ báo giá."""
    return await _svc(session).get_quotation(quotation_id)


@router.patch("/{quotation_id}", response_model=QuotationPublic)
async def update_quotation(
    quotation_id: uuid.UUID,
    body: QuotationUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_UPDATE")),
) -> QuotationPublic:
    """Cập nhật thông tin chung của hồ sơ."""
    return await _svc(session).update_quotation(quotation_id, body, current_user)


@router.delete("/{quotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quotation(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_DELETE")),
) -> None:
    """Xóa mềm hồ sơ (chỉ BGĐ/admin)."""
    await _svc(session).delete_quotation(quotation_id, current_user)


# ---------------------------------------------------------------------------
# Workflow transitions
# ---------------------------------------------------------------------------

@router.post("/{quotation_id}/submit-survey", response_model=QuotationPublic)
async def submit_survey(
    quotation_id: uuid.UUID,
    body: QuotationSubmitSurveyRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_SUBMIT_SURVEY")),
) -> QuotationPublic:
    """S1 → S2: Kinh Doanh nộp thông tin khảo sát, chờ BGĐ duyệt."""
    return await _svc(session).submit_survey(quotation_id, body, current_user)


@router.post("/{quotation_id}/approve-survey", response_model=QuotationPublic)
async def approve_survey(
    quotation_id: uuid.UUID,
    body: QuotationApproveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_APPROVE_SURVEY")),
) -> QuotationPublic:
    """S2: BGĐ phê duyệt hoặc từ chối thông tin khảo sát."""
    return await _svc(session).approve_survey(quotation_id, body, current_user)


@router.post("/{quotation_id}/submit-design", response_model=QuotationPublic)
async def submit_design(
    quotation_id: uuid.UUID,
    body: QuotationSubmitDesignRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_DESIGN")),
) -> QuotationPublic:
    """S3 → S4: Kỹ Thuật nộp phương án thiết kế, chờ BGĐ duyệt."""
    return await _svc(session).submit_design(quotation_id, body, current_user)


@router.post("/{quotation_id}/approve-design", response_model=QuotationPublic)
async def approve_design(
    quotation_id: uuid.UUID,
    body: QuotationApproveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_APPROVE_DESIGN")),
) -> QuotationPublic:
    """S4: BGĐ phê duyệt hoặc từ chối phương án thiết kế."""
    return await _svc(session).approve_design(quotation_id, body, current_user)


@router.post("/{quotation_id}/submit-pricing", response_model=QuotationPublic)
async def submit_pricing(
    quotation_id: uuid.UUID,
    body: QuotationSubmitPricingRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_FILL_PRICE")),
) -> QuotationPublic:
    """S5 → S6: Vật Tư xác nhận đã điền đủ đơn giá."""
    return await _svc(session).submit_pricing(quotation_id, body, current_user)


@router.post("/{quotation_id}/finalize", response_model=QuotationPublic)
async def finalize(
    quotation_id: uuid.UUID,
    body: QuotationFinalizeRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_FINALIZE")),
) -> QuotationPublic:
    """S6 → S7: Kinh Doanh nhập hệ số giá, hoàn thiện, nộp BGĐ duyệt cuối."""
    return await _svc(session).finalize(quotation_id, body, current_user)


@router.post("/{quotation_id}/approve-final", response_model=QuotationPublic)
async def approve_final(
    quotation_id: uuid.UUID,
    body: QuotationApproveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_APPROVE_FINAL")),
) -> QuotationPublic:
    """S7: BGĐ phê duyệt báo giá cuối hoặc yêu cầu chỉnh sửa lại."""
    return await _svc(session).approve_final(quotation_id, body, current_user)


@router.post("/{quotation_id}/send-to-client", response_model=QuotationPublic)
async def send_to_client(
    quotation_id: uuid.UUID,
    body: QuotationSendToClientRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_SEND_CLIENT")),
) -> QuotationPublic:
    """S8: Ghi nhận đã gửi báo giá cho khách hàng."""
    return await _svc(session).send_to_client(quotation_id, body, current_user)


@router.post("/{quotation_id}/submit-negotiation", response_model=QuotationPublic)
async def submit_negotiation(
    quotation_id: uuid.UUID,
    body: QuotationSubmitNegotiationRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_SEND_CLIENT")),
) -> QuotationPublic:
    """S8 → S8B: KD ghi nhận thương lượng và trình GĐ duyệt."""
    return await _svc(session).submit_negotiation(quotation_id, body, current_user)


@router.post("/{quotation_id}/approve-negotiation", response_model=QuotationPublic)
async def approve_negotiation(
    quotation_id: uuid.UUID,
    body: QuotationApproveRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_APPROVE_NEGOTIATION")),
) -> QuotationPublic:
    """S8B: GĐ duyệt hoặc không đồng ý thương lượng."""
    return await _svc(session).approve_negotiation(quotation_id, body, current_user)


@router.post("/{quotation_id}/close", response_model=QuotationPublic)
async def close_quotation(
    quotation_id: uuid.UUID,
    body: QuotationCloseRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_CLOSE")),
) -> QuotationPublic:
    """S8 → S9: Đóng hồ sơ (won → tạo Project / lost → lưu lý do)."""
    return await _svc(session).close_quotation(quotation_id, body, current_user)


# ---------------------------------------------------------------------------
# Stage history
# ---------------------------------------------------------------------------

@router.get(
    "/{quotation_id}/history",
    response_model=list[QuotationStageTransitionPublic],
)
async def list_history(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationStageTransitionPublic]:
    """Lịch sử các bước chuyển giai đoạn của hồ sơ."""
    return await _svc(session).list_history(quotation_id)


# ---------------------------------------------------------------------------
# Negotiation logs
# ---------------------------------------------------------------------------

@router.get(
    "/{quotation_id}/negotiations",
    response_model=list[QuotationNegotiationLogPublic],
)
async def list_negotiations(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationNegotiationLogPublic]:
    """Lịch sử trao đổi thương lượng với khách hàng."""
    return await _svc(session).list_negotiations(quotation_id)


@router.post(
    "/{quotation_id}/negotiations",
    response_model=QuotationNegotiationLogPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_negotiation_log(
    quotation_id: uuid.UUID,
    body: QuotationNegotiationLogCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_LOG_NEGOTIATION")),
) -> QuotationNegotiationLogPublic:
    """Ghi nhận một lần trao đổi/thương lượng với khách hàng."""
    return await _svc(session).add_negotiation_log(quotation_id, body, current_user)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.get(
    "/{quotation_id}/attachments",
    response_model=list[QuotationAttachmentPublic],
)
async def list_attachments(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationAttachmentPublic]:
    """Danh sách file đính kèm (bản vẽ, tài liệu kỹ thuật)."""
    return await _svc(session).list_attachments(quotation_id)


@router.post(
    "/{quotation_id}/attachments",
    response_model=QuotationAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_attachment(
    quotation_id: uuid.UUID,
    body: QuotationAttachmentCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> QuotationAttachmentPublic:
    """Upload file đính kèm vào hồ sơ."""
    return await _svc(session).add_attachment(quotation_id, body, current_user)


@router.post(
    "/{quotation_id}/attachments/upload",
    response_model=QuotationAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment_file(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
    file: UploadFile = File(...),
    description: str | None = Query(default=None),
) -> QuotationAttachmentPublic:
    """Upload file binary lên hệ thống và tự tạo quotation attachment."""
    try:
        stored = await _quotation_storage.save_upload(file)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    content_type = (file.content_type or "").lower()
    file_type = "photo" if content_type.startswith("image/") else "document"
    body = QuotationAttachmentCreate(
        file_url=stored.public_url,
        file_name=file.filename or stored.stored_name,
        file_type=file_type,
        description=description,
    )
    return await _svc(session).add_attachment(quotation_id, body, current_user)


@router.delete(
    "/{quotation_id}/attachments/{att_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    quotation_id: uuid.UUID,
    att_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_UPDATE")),
) -> None:
    """Xóa file đính kèm."""
    await _svc(session).delete_attachment(quotation_id, att_id, current_user)


# ---------------------------------------------------------------------------
# Versions (snapshots)
# ---------------------------------------------------------------------------

@router.get(
    "/{quotation_id}/versions",
    response_model=list[QuotationVersionPublic],
)
async def list_versions(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> list[QuotationVersionPublic]:
    """Danh sách các phiên bản snapshot của bảng báo giá."""
    return await _svc(session).list_versions(quotation_id)


@router.get(
    "/{quotation_id}/versions/{version_id}",
    response_model=QuotationVersionPublic,
)
async def get_version(
    quotation_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_any_permission("QUOTATION_VIEW", "QUOTATION_VIEW_ALL")),
) -> QuotationVersionPublic:
    """Xem nội dung một phiên bản snapshot cụ thể."""
    return await _svc(session).get_version(quotation_id, version_id)


@router.post(
    "/{quotation_id}/versions",
    response_model=QuotationVersionPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_version_snapshot(
    quotation_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_UPDATE")),
    reason: str = Query(default="manual"),
) -> QuotationVersionPublic:
    """Tạo snapshot thủ công tại thời điểm hiện tại."""
    return await _svc(session).create_version_snapshot(quotation_id, current_user, reason)


# ---------------------------------------------------------------------------
# Reports & Analytics
# ---------------------------------------------------------------------------

@router.get("/reports/summary", response_model=QuotationReportSummary)
async def report_summary(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_REPORT")),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    equipment_category: str | None = Query(default=None),
    client_company_name: str | None = Query(default=None),
) -> QuotationReportSummary:
    """Tổng quan: tổng số hồ sơ, tỷ lệ thắng/thua, tổng giá trị."""
    return await _svc(session).report_summary(
        current_user,
        date_from=date_from,
        date_to=date_to,
        equipment_category=equipment_category,
        client_company_name=client_company_name,
    )


@router.get("/reports/by-client", response_model=list[QuotationByClientRow])
async def report_by_client(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_REPORT")),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[QuotationByClientRow]:
    """Phân tích báo giá theo từng khách hàng."""
    return await _svc(session).report_by_client(current_user, date_from=date_from, date_to=date_to)


@router.get("/reports/by-equipment", response_model=list[QuotationByEquipmentRow])
async def report_by_equipment(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_REPORT")),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[QuotationByEquipmentRow]:
    """Phân tích báo giá theo hạng mục thiết bị."""
    return await _svc(session).report_by_equipment(
        current_user, date_from=date_from, date_to=date_to
    )


@router.get("/reports/lost-analysis", response_model=list[QuotationLostReasonRow])
async def report_lost_analysis(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("QUOTATION_REPORT")),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[QuotationLostReasonRow]:
    """Phân tích nguyên nhân thua trong các hồ sơ đã đóng."""
    return await _svc(session).report_lost_analysis(
        current_user, date_from=date_from, date_to=date_to
    )
