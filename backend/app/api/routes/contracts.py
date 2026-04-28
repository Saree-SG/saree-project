"""Contract management routes."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep
from app.core.config import settings
from app.models.contract import (
    ContractActionRequest,
    ContractConfirmAdvanceRequest,
    ContractCreate,
    ContractPublic,
    ContractsPublic,
    ContractSignRequest,
    ContractUpdate,
    ContractWithDetailsPublic,
    ContractAttachmentPublic,
)
from app.models.user import User
from app.services.contract_service import ContractService
from app.shared.permission import require_any_permission, require_permission
from app.shared.storage import LocalStorage

router = APIRouter(prefix="/contracts", tags=["contracts"])
_contract_storage = LocalStorage(
    base_dir=settings.CONTRACT_UPLOAD_DIR,
    static_url_segment="contract",
)


def _svc(session: AsyncSession) -> ContractService:
    return ContractService(session, storage=_contract_storage)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=ContractsPublic)
async def list_contracts(
    session: AsyncSessionDep,
    current_user: User = Depends(
        require_any_permission("CONTRACT_VIEW", "CONTRACT_VIEW_ALL")
    ),
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ContractsPublic:
    return await _svc(session).list_contracts(
        current_user.company_id, status=status_filter, skip=skip, limit=limit
    )


@router.post("/", response_model=ContractPublic, status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_CREATE")),
) -> ContractPublic:
    return await _svc(session).create_contract(body, current_user)


@router.get("/{contract_id}", response_model=ContractWithDetailsPublic)
async def get_contract(
    contract_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(
        require_any_permission("CONTRACT_VIEW", "CONTRACT_VIEW_ALL")
    ),
) -> ContractWithDetailsPublic:
    return await _svc(session).get_contract(contract_id, current_user.company_id)


@router.patch("/{contract_id}", response_model=ContractPublic)
async def update_contract(
    contract_id: uuid.UUID,
    body: ContractUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_UPDATE")),
) -> ContractPublic:
    return await _svc(session).update_contract(contract_id, body, current_user)


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(
    contract_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_DELETE")),
) -> None:
    await _svc(session).delete_contract(contract_id, current_user)


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

@router.post("/{contract_id}/submit", response_model=ContractPublic)
async def submit_contract(
    contract_id: uuid.UUID,
    body: ContractActionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_SUBMIT")),
) -> ContractPublic:
    """Nộp hợp đồng lên BGĐ duyệt (draft → pending_approval)."""
    return await _svc(session).transition(
        contract_id, "submit", current_user, note=body.note
    )


@router.post("/{contract_id}/approve", response_model=ContractPublic)
async def approve_contract(
    contract_id: uuid.UUID,
    body: ContractActionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_APPROVE")),
) -> ContractPublic:
    """BGĐ duyệt hợp đồng, chuyển sang gửi khách (pending_approval → sent)."""
    return await _svc(session).transition(
        contract_id, "approve", current_user, note=body.note
    )


@router.post("/{contract_id}/reject", response_model=ContractPublic)
async def reject_contract(
    contract_id: uuid.UUID,
    body: ContractActionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_APPROVE")),
) -> ContractPublic:
    """BGĐ từ chối hợp đồng, trả về draft (pending_approval → draft)."""
    return await _svc(session).transition(
        contract_id, "reject", current_user, note=body.note
    )


@router.post("/{contract_id}/sign", response_model=ContractPublic)
async def sign_contract(
    contract_id: uuid.UUID,
    body: ContractSignRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_SIGN")),
) -> ContractPublic:
    """Xác nhận khách đã ký hợp đồng (sent → signed)."""
    return await _svc(session).transition(
        contract_id, "sign", current_user,
        note=body.note, signing_date=body.signing_date,
    )


@router.post("/{contract_id}/confirm-advance", response_model=ContractPublic)
async def confirm_advance(
    contract_id: uuid.UUID,
    body: ContractConfirmAdvanceRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_CONFIRM_ADVANCE")),
) -> ContractPublic:
    """Xác nhận đã nhận tạm ứng (signed → advance_received)."""
    return await _svc(session).transition(
        contract_id, "confirm_advance", current_user,
        note=body.note,
        advance_amount=body.advance_amount,
        advance_paid_at=body.advance_paid_at,
    )


@router.post("/{contract_id}/start-production", response_model=ContractPublic)
async def start_production(
    contract_id: uuid.UUID,
    body: ContractActionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_START_PRODUCTION")),
) -> ContractPublic:
    """Chuyển hợp đồng sang giai đoạn sản xuất (advance_received → in_production)."""
    return await _svc(session).transition(
        contract_id, "start_production", current_user, note=body.note
    )


@router.post("/{contract_id}/complete", response_model=ContractPublic)
async def complete_contract(
    contract_id: uuid.UUID,
    body: ContractActionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_COMPLETE")),
) -> ContractPublic:
    """Hoàn thành và đóng hợp đồng (in_production → completed)."""
    return await _svc(session).transition(
        contract_id, "complete", current_user, note=body.note
    )


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post(
    "/{contract_id}/attachments/upload",
    response_model=ContractAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    contract_id: uuid.UUID,
    session: AsyncSessionDep,
    file: UploadFile = File(...),
    file_type: str = Query(default="document"),
    description: str | None = Query(default=None),
    phase: str | None = Query(default=None),
    current_user: User = Depends(require_permission("CONTRACT_UPDATE")),
) -> ContractAttachmentPublic:
    return await _svc(session).upload_attachment(
        contract_id, file, file_type, description, current_user, phase=phase
    )


@router.delete(
    "/{contract_id}/attachments/{att_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    contract_id: uuid.UUID,
    att_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("CONTRACT_UPDATE")),
) -> None:
    await _svc(session).delete_attachment(contract_id, att_id, current_user)
