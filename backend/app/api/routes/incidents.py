"""Incident routes — construction issue log + knowledge base."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.core.config import settings
from app.models.incident import (
    IncidentAttachmentPublic,
    IncidentCreate,
    IncidentPublic,
    IncidentResolve,
    IncidentsPublic,
    IncidentUpdate,
)
from app.models.user import User
from app.services.incident_service import IncidentService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(prefix="/incidents", tags=["incidents"])

_incident_storage = LocalStorage(
    base_dir=settings.INCIDENT_UPLOAD_DIR,
    static_url_segment="incident",
)


def _svc(session: AsyncSession) -> IncidentService:
    return IncidentService(session)


@router.post("", response_model=IncidentPublic, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_CREATE")),
) -> IncidentPublic:
    """Report a new construction/installation incident."""
    incident = await _svc(session).create(body, current_user)
    return IncidentPublic.model_validate(incident, from_attributes=True)


@router.get("", response_model=IncidentsPublic)
async def list_incidents(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_VIEW")),
    category: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    project_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, description="Tìm theo tiêu đề/mô tả/giải pháp"),
    skip: int = 0,
    limit: int = 50,
) -> IncidentsPublic:
    """List / search incidents (knowledge base)."""
    items, total = await _svc(session).list(
        current_user,
        category=category,
        status_filter=status_filter,
        project_id=project_id,
        q=q,
        skip=skip,
        limit=limit,
    )
    data = [IncidentPublic.model_validate(i, from_attributes=True) for i in items]
    return IncidentsPublic(data=data, count=total)


@router.get("/{incident_id}", response_model=IncidentPublic)
async def get_incident(
    incident_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_VIEW")),
) -> IncidentPublic:
    incident = await _svc(session).get(incident_id)
    return IncidentPublic.model_validate(incident, from_attributes=True)


@router.patch("/{incident_id}", response_model=IncidentPublic)
async def update_incident(
    incident_id: uuid.UUID,
    body: IncidentUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_RESOLVE")),
) -> IncidentPublic:
    incident = await _svc(session).update(incident_id, body)
    return IncidentPublic.model_validate(incident, from_attributes=True)


@router.post("/{incident_id}/resolve", response_model=IncidentPublic)
async def resolve_incident(
    incident_id: uuid.UUID,
    body: IncidentResolve,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_RESOLVE")),
) -> IncidentPublic:
    """Record root cause + solution and mark the incident resolved."""
    incident = await _svc(session).resolve(incident_id, body, current_user)
    return IncidentPublic.model_validate(incident, from_attributes=True)


@router.post(
    "/{incident_id}/attachments",
    response_model=IncidentAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_incident_attachment(
    incident_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("INCIDENT_CREATE")),
    file: UploadFile = File(...),
) -> IncidentAttachmentPublic:
    """Attach a photo/document to an incident as evidence."""
    content_type = (file.content_type or "").lower()
    file_type = "image" if content_type.startswith("image/") else "document"
    try:
        stored = await _incident_storage.save_upload(file)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    att = await _svc(session).add_attachment(incident_id, stored.public_url, file_type)
    return IncidentAttachmentPublic.model_validate(att, from_attributes=True)
