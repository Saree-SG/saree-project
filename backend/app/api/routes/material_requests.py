"""Material Request routes — 2-step approval workflow."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, status

from app.api.deps import AsyncSessionDep
from app.core.config import settings
from app.models.material_request import (
    MaterialRequestCreate,
    MaterialRequestDecision,
    MaterialRequestPublic,
    MaterialRequestReview,
)
from app.models.user import User
from app.services.material_request_service import MaterialRequestService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(prefix="/material-requests", tags=["material-requests"])

_storage = LocalStorage(
    base_dir=settings.MATERIAL_REQUEST_UPLOAD_DIR,
    static_url_segment="material-requests",
)


def _svc(session) -> MaterialRequestService:
    return MaterialRequestService(session, _storage)


@router.post("", response_model=MaterialRequestPublic, status_code=status.HTTP_201_CREATED)
async def create_material_request(
    body: MaterialRequestCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_CREATE")),
) -> MaterialRequestPublic:
    return await _svc(session).create(body, current_user)


@router.get("", response_model=list[MaterialRequestPublic])
async def list_material_requests(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_VIEW")),
    status_filter: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[MaterialRequestPublic]:
    return await _svc(session).list_requests(
        current_user, status_filter=status_filter, skip=skip, limit=limit
    )


@router.get("/{request_id}", response_model=MaterialRequestPublic)
async def get_material_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_VIEW")),
) -> MaterialRequestPublic:
    return await _svc(session).get_or_404(request_id, current_user)


@router.post("/{request_id}/attachments", response_model=MaterialRequestPublic)
async def upload_attachment(
    request_id: uuid.UUID,
    file: UploadFile,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_CREATE")),
) -> MaterialRequestPublic:
    return await _svc(session).add_attachment(request_id, file, current_user)


@router.delete("/{request_id}/attachments/{att_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    request_id: uuid.UUID,
    att_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_CREATE")),
) -> None:
    await _svc(session).delete_attachment(request_id, att_id, current_user)


@router.post("/{request_id}/review", response_model=MaterialRequestPublic)
async def review_material_request(
    request_id: uuid.UUID,
    body: MaterialRequestReview,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_REVIEW")),
) -> MaterialRequestPublic:
    return await _svc(session).review(request_id, body, current_user)


@router.post("/{request_id}/decide", response_model=MaterialRequestPublic)
async def decide_material_request(
    request_id: uuid.UUID,
    body: MaterialRequestDecision,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("MATERIAL_REQUEST_APPROVE")),
) -> MaterialRequestPublic:
    return await _svc(session).decide(request_id, body, current_user)
