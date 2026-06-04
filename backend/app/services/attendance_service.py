"""
Attendance service — site check-in / check-out with GPS validation.

Distance between device coordinates and the project's configured site location
is computed with the Haversine formula. A check-in is considered valid when:

    distance <= site_radius_m + (device accuracy buffer)

so workers standing legitimately at the edge of a large site (where GPS error
is naturally higher outdoors) are not penalised. `check_in_at` / `check_out_at`
are stamped server-side; the device clock is never trusted.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.org import ProjectMemberRole
from app.models.project import Project
from app.models.user import User

# Cap how much device-reported accuracy can extend the allowed radius, so a
# huge (desktop / IP-based) accuracy value cannot trivially mark a check-in valid.
_MAX_ACCURACY_BUFFER_M = 100.0
# Above this reported accuracy the fix is treated as unreliable (e.g. PC on WiFi/IP).
_UNRELIABLE_ACCURACY_M = 500.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two WGS-84 points, in metres."""
    r = 6371000.0  # Earth radius (m)
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class AttendanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _get_project(self, project_id: uuid.UUID) -> Project:
        project = await self._session.get(Project, project_id)
        if not project or project.is_deleted:
            raise HTTPException(404, "Project not found")
        return project

    async def _ensure_member(self, user: User, project: Project) -> None:
        """Only project members (or its creator / superuser) may check in."""
        if user.is_superuser or project.created_by == user.id:
            return
        result = await self._session.execute(
            select(ProjectMemberRole.user_id).where(
                ProjectMemberRole.project_id == project.id,
                ProjectMemberRole.user_id == user.id,
            )
        )
        if result.scalars().first() is None:
            raise HTTPException(
                403, "You are not assigned to this project and cannot check in"
            )

    def _evaluate(
        self, project: Project, lat: float, lng: float, accuracy_m: float | None
    ) -> tuple[float, bool]:
        """Return (distance_m, is_valid) for a coordinate against the site."""
        if project.site_lat is None or project.site_lng is None:
            # Site not configured → record distance as 0 and flag invalid so it
            # surfaces for review rather than silently passing.
            return 0.0, False
        distance = haversine_m(lat, lng, project.site_lat, project.site_lng)
        if accuracy_m is not None and accuracy_m > _UNRELIABLE_ACCURACY_M:
            return distance, False
        buffer = min(accuracy_m or 0.0, _MAX_ACCURACY_BUFFER_M)
        is_valid = distance <= project.site_radius_m + buffer
        return distance, is_valid

    async def _open_record(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> AttendanceRecord | None:
        """Most recent record for this user+project that has not checked out."""
        result = await self._session.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.project_id == project_id,
                AttendanceRecord.check_out_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        )
        return result.scalars().first()

    async def check_in(
        self,
        user: User,
        project_id: uuid.UUID,
        lat: float,
        lng: float,
        accuracy_m: float | None,
        photo_url: str,
        note: str | None = None,
    ) -> AttendanceRecord:
        project = await self._get_project(project_id)
        await self._ensure_member(user, project)
        if await self._open_record(user.id, project_id):
            raise HTTPException(
                409, "You already have an open check-in for this project. Check out first."
            )
        now = datetime.now(timezone.utc)
        distance, valid = self._evaluate(project, lat, lng, accuracy_m)
        record = AttendanceRecord(
            user_id=user.id,
            project_id=project_id,
            work_date=now.date(),
            check_in_at=now,
            check_in_lat=lat,
            check_in_lng=lng,
            check_in_accuracy_m=accuracy_m,
            check_in_distance_m=distance,
            check_in_valid=valid,
            check_in_photo_url=photo_url,
            note=note,
        )
        self._session.add(record)
        await self._session.flush()
        return record

    async def check_out(
        self,
        user: User,
        record_id: uuid.UUID,
        lat: float,
        lng: float,
        accuracy_m: float | None,
        photo_url: str,
    ) -> AttendanceRecord:
        record = await self._session.get(AttendanceRecord, record_id)
        if not record:
            raise HTTPException(404, "Attendance record not found")
        if record.user_id != user.id and not user.is_superuser:
            raise HTTPException(403, "Cannot check out another user's record")
        if record.check_out_at is not None:
            raise HTTPException(409, "This record is already checked out")

        project = await self._get_project(record.project_id)
        now = datetime.now(timezone.utc)
        distance, valid = self._evaluate(project, lat, lng, accuracy_m)

        record.check_out_at = now
        record.check_out_lat = lat
        record.check_out_lng = lng
        record.check_out_accuracy_m = accuracy_m
        record.check_out_distance_m = distance
        record.check_out_valid = valid
        record.check_out_photo_url = photo_url
        record.work_hours = round(
            (now - record.check_in_at).total_seconds() / 3600.0, 2
        )
        self._session.add(record)
        await self._session.flush()
        return record

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        date_from=None,
        date_to=None,
    ) -> list[AttendanceRecord]:
        stmt = select(AttendanceRecord).where(AttendanceRecord.user_id == user_id)
        if date_from is not None:
            stmt = stmt.where(AttendanceRecord.work_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(AttendanceRecord.work_date <= date_to)
        stmt = stmt.order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_for_project(
        self, project_id: uuid.UUID, work_date=None
    ) -> list[AttendanceRecord]:
        stmt = select(AttendanceRecord).where(
            AttendanceRecord.project_id == project_id
        )
        if work_date is not None:
            stmt = stmt.where(AttendanceRecord.work_date == work_date)
        stmt = stmt.order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def set_site_location(
        self,
        project_id: uuid.UUID,
        site_lat: float | None,
        site_lng: float | None,
        site_radius_m: int | None,
    ) -> Project:
        project = await self._get_project(project_id)
        project.site_lat = site_lat
        project.site_lng = site_lng
        if site_radius_m is not None:
            project.site_radius_m = site_radius_m
        self._session.add(project)
        await self._session.flush()
        return project
