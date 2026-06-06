"""Attendance routes — on-site check-in / check-out with GPS + mandatory photo."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from app.api.deps import AsyncSessionDep, CurrentUser
from app.core.config import settings
from app.models.attendance import (
    AttendanceRecordPublic,
    AttendanceRecordsPublic,
    SiteLocationUpdate,
)
from app.models.project import ProjectPublic
from app.models.user import User
from app.services.attendance_service import AttendanceService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(tags=["attendance"])

_attendance_storage = LocalStorage(
    base_dir=settings.ATTENDANCE_UPLOAD_DIR,
    static_url_segment="attendance",
)


def _svc(session: AsyncSession) -> AttendanceService:
    return AttendanceService(session)


async def _save_photo(file: UploadFile) -> str:
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(422, "File must be an image")
    try:
        stored = await _attendance_storage.save_upload(file)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return stored.public_url


@router.post(
    "/attendance/check-in",
    response_model=AttendanceRecordPublic,
    status_code=status.HTTP_201_CREATED,
)
async def check_in(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_CHECKIN")),
    file: UploadFile = File(...),
    project_id: uuid.UUID = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    accuracy_m: float | None = Form(default=None),
    note: str | None = Form(default=None),
) -> AttendanceRecordPublic:
    """Record an on-site check-in. Requires a photo taken at the site."""
    photo_url = await _save_photo(file)
    record = await _svc(session).check_in(
        current_user, project_id, lat, lng, accuracy_m, photo_url, note
    )
    return AttendanceRecordPublic.model_validate(record, from_attributes=True)


@router.post(
    "/attendance/check-out",
    response_model=AttendanceRecordPublic,
)
async def check_out(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_CHECKIN")),
    file: UploadFile = File(...),
    record_id: uuid.UUID = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    accuracy_m: float | None = Form(default=None),
) -> AttendanceRecordPublic:
    """Record check-out for an open attendance record; computes work hours."""
    photo_url = await _save_photo(file)
    record = await _svc(session).check_out(
        current_user, record_id, lat, lng, accuracy_m, photo_url
    )
    return AttendanceRecordPublic.model_validate(record, from_attributes=True)


class _AdjustHoursRequest(SQLModel):
    work_hours: float
    note: str | None = None


@router.patch("/attendance/{record_id}/hours", response_model=AttendanceRecordPublic)
async def adjust_attendance_hours(
    record_id: uuid.UUID,
    body: _AdjustHoursRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_VIEW_TEAM")),
) -> AttendanceRecordPublic:
    """Manager corrects work hours (e.g. confirm hours of a forgotten check-out)."""
    record = await _svc(session).adjust_hours(record_id, body.work_hours, body.note)
    return AttendanceRecordPublic.model_validate(record, from_attributes=True)


@router.get("/attendance/me", response_model=AttendanceRecordsPublic)
async def my_attendance(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> AttendanceRecordsPublic:
    """List the current user's attendance records."""
    records = await _svc(session).list_for_user(current_user.id, date_from, date_to)
    data = [
        AttendanceRecordPublic.model_validate(r, from_attributes=True) for r in records
    ]
    return AttendanceRecordsPublic(data=data, count=len(data))


@router.get(
    "/projects/{project_id}/attendance",
    response_model=AttendanceRecordsPublic,
)
async def project_attendance(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_VIEW_TEAM")),
    work_date: date | None = Query(default=None),
) -> AttendanceRecordsPublic:
    """List attendance records for a project (managers / leaders)."""
    records = await _svc(session).list_for_project(project_id, work_date)
    data = [
        AttendanceRecordPublic.model_validate(r, from_attributes=True) for r in records
    ]
    return AttendanceRecordsPublic(data=data, count=len(data))


@router.patch(
    "/projects/{project_id}/site-location",
    response_model=ProjectPublic,
)
async def set_site_location(
    project_id: uuid.UUID,
    body: SiteLocationUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_CONFIG_SITE")),
) -> ProjectPublic:
    """Configure a project's site coordinates and allowed check-in radius."""
    project = await _svc(session).set_site_location(
        project_id, body.site_lat, body.site_lng, body.site_radius_m
    )
    return ProjectPublic.model_validate(project, from_attributes=True)
