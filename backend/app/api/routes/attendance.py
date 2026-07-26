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
    AttendanceShiftConfig,
    AttendanceShiftConfigPublic,
    AttendanceTeamRecordPublic,
    AttendanceTeamRecordsPublic,
    SiteLocationUpdate,
)
from app.models.org import CompanyPublic
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
    lat: float = Form(...),
    lng: float = Form(...),
    mode: str = Form(default="project"),
    project_id: uuid.UUID | None = Form(default=None),
    company_id: uuid.UUID | None = Form(default=None),
    customer_company_id: uuid.UUID | None = Form(default=None),
    task_label: str | None = Form(default=None),
    accuracy_m: float | None = Form(default=None),
    note: str | None = Form(default=None),
) -> AttendanceRecordPublic:
    """Record an on-site check-in. Requires a photo taken at the site.

    `mode="project"` (default) checks in against a project site; `mode="company"`
    checks in against a company with a free-text `task_label`.
    """
    photo_url = await _save_photo(file)
    record = await _svc(session).check_in(
        current_user,
        lat,
        lng,
        accuracy_m,
        photo_url,
        mode=mode,
        project_id=project_id,
        company_id=company_id,
        customer_company_id=customer_company_id,
        task_label=task_label,
        note=note,
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


@router.get(
    "/companies/{company_id}/attendance",
    response_model=AttendanceTeamRecordsPublic,
)
async def company_attendance(
    company_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_VIEW_TEAM")),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> AttendanceTeamRecordsPublic:
    """List attendance for all members of a company (managers / directors).

    Records are enriched with the employee name and a location label. Access is
    additionally guarded so a manager can only read companies they belong to.
    """
    svc = _svc(session)
    await svc.ensure_company_access(current_user, company_id)
    rows = await svc.list_for_company(company_id, date_from, date_to)
    data = [AttendanceTeamRecordPublic.model_validate(r) for r in rows]
    return AttendanceTeamRecordsPublic(data=data, count=len(data))


@router.get("/attendance/task-suggestions", response_model=list[str])
async def attendance_task_suggestions(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[str]:
    """Free-text tasks the current user has used in by-company check-ins."""
    return await _svc(session).list_task_suggestions(current_user.id)


@router.patch(
    "/companies/{company_id}/site-location",
    response_model=CompanyPublic,
)
async def set_company_site_location(
    company_id: uuid.UUID,
    body: SiteLocationUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_CONFIG_SITE")),
) -> CompanyPublic:
    """Configure a company's site coordinates and allowed check-in radius."""
    company = await _svc(session).set_company_site_location(
        company_id, body.site_lat, body.site_lng, body.site_radius_m
    )
    return CompanyPublic.model_validate(company, from_attributes=True)


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


# ---------------------------------------------------------------------------
# Shift config (KPI scoring thresholds, Bước 8)
# ---------------------------------------------------------------------------

from datetime import time as _time  # noqa: E402
from pydantic import BaseModel as _BM  # noqa: E402


class _ShiftConfigBody(_BM):
    check_in_deadline: _time | None = None
    check_out_earliest: _time | None = None
    tolerance_minutes: int | None = None
    half_day_minutes: int | None = None
    full_day_minutes: int | None = None
    timezone: str | None = None


@router.get("/attendance/shift-config", response_model=AttendanceShiftConfigPublic)
async def get_shift_config(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> AttendanceShiftConfigPublic:
    """Lấy cấu hình ca làm việc của công ty (dùng để tính KPI chấm công)."""
    if not current_user.company_id:
        raise HTTPException(400, "User chưa thuộc công ty nào.")
    cfg = await session.get(AttendanceShiftConfig, current_user.company_id)
    if not cfg:
        cfg = AttendanceShiftConfig(company_id=current_user.company_id)
    return AttendanceShiftConfigPublic.model_validate(cfg, from_attributes=True)


@router.patch(
    "/attendance/shift-config",
    response_model=AttendanceShiftConfigPublic,
)
async def update_shift_config(
    body: _ShiftConfigBody,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("ATTENDANCE_CONFIG_SITE")),
) -> AttendanceShiftConfigPublic:
    """Cập nhật cấu hình ca làm việc (chỉ quản lý)."""
    if not current_user.company_id:
        raise HTTPException(400, "User chưa thuộc công ty nào.")
    cfg = await session.get(AttendanceShiftConfig, current_user.company_id)
    if not cfg:
        cfg = AttendanceShiftConfig(company_id=current_user.company_id)
        session.add(cfg)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(cfg, field, val)
    session.add(cfg)
    await session.flush()
    await session.refresh(cfg)
    return AttendanceShiftConfigPublic.model_validate(cfg, from_attributes=True)
