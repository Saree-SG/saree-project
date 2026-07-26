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
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord, AttendanceShiftConfig
from app.models.customer_company import CustomerCompany
from app.models.org import Company, ProjectMemberRole, UserCompanyRole
from app.services.kpi_scoring import ShiftThresholds, score_attendance
from app.models.project import Project
from app.models.user import User

# Cap how much device-reported accuracy can extend the allowed radius, so a
# huge (desktop / IP-based) accuracy value cannot trivially mark a check-in valid.
_MAX_ACCURACY_BUFFER_M = 100.0
# Above this reported accuracy the fix is treated as unreliable (e.g. PC on WiFi/IP).
_UNRELIABLE_ACCURACY_M = 500.0
# Maximum length of a single work shift. Hours beyond this are capped and a
# still-open record older than this is treated as a forgotten check-out — the
# point at which the worker is reminded to check out.
MAX_SHIFT_HOURS = 8.0
# Grace period after the reminder. A shift still open past MAX_SHIFT_HOURS gets a
# "please check out" reminder; if it is STILL open this many hours later the day
# is recorded as absent (vắng) and no hours are credited.
CHECKOUT_GRACE_HOURS = 1.0
# A shift open longer than this with no check-out → recorded as absent.
ABSENT_AFTER_HOURS = MAX_SHIFT_HOURS + CHECKOUT_GRACE_HOURS


# Manager-facing audit notes appended when the system auto-closes a forgotten
# check-out. Shared by the lazy (check-in) path and the periodic Celery job.
_FORGOTTEN_NOTE = "[Quên chấm công ra — quản lý cần xác nhận giờ công]"
_ABSENT_NOTE = "[Quá giờ không chấm công ra — ghi nhận vắng]"


def apply_auto_close(record: AttendanceRecord, *, absent: bool) -> None:
    """Close an open record left over from a forgotten check-out (no session I/O).

    Hours are never credited — we do not know when the worker actually left, so
    `check_out_at` is only a nominal stamp (check-in + max shift) that lets the
    worker check in again. When `absent` the day is recorded as vắng
    (``is_absent``) and not counted; a manager may still credit hours later via
    ``adjust_hours`` (which clears the absent flag). Pure mutation so both the
    async service and the sync Celery job can reuse it.
    """
    record.check_out_at = record.check_in_at + timedelta(hours=MAX_SHIFT_HOURS)
    record.work_hours = None
    record.is_capped = False
    record.is_auto_closed = True
    if absent:
        record.is_absent = True
    record.note = " ".join(
        filter(None, [record.note, _ABSENT_NOTE if absent else _FORGOTTEN_NOTE])
    )


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

    async def _get_company(self, company_id: uuid.UUID) -> Company:
        company = await self._session.get(Company, company_id)
        if not company or not company.is_active:
            raise HTTPException(404, "Company not found")
        return company

    async def _get_customer_company(
        self, customer_company_id: uuid.UUID, user: User
    ) -> CustomerCompany:
        """Resolve a customer company, scoped to the user's own tenant."""
        cc = await self._session.get(CustomerCompany, customer_company_id)
        if cc is None or cc.is_deleted or cc.company_id != user.company_id:
            raise HTTPException(404, "Customer company not found")
        return cc

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

    async def _ensure_company_member(self, user: User, company: Company) -> None:
        """Members of the company (or superuser) may check in against it.

        By design we also allow members of OTHER companies to check in here —
        the whole point of by-company mode is helping out at another site. But
        the user must belong to at least one company; we don't require it to be
        this one. Superusers always pass.
        """
        if user.is_superuser:
            return
        result = await self._session.execute(
            select(UserCompanyRole.user_id).where(
                UserCompanyRole.user_id == user.id
            )
        )
        if result.scalars().first() is None:
            raise HTTPException(
                403, "You are not assigned to any company and cannot check in"
            )

    def _evaluate_site(
        self,
        site_lat: float | None,
        site_lng: float | None,
        site_radius_m: int,
        lat: float,
        lng: float,
        accuracy_m: float | None,
    ) -> tuple[float, bool]:
        """Return (distance_m, is_valid) for a coordinate against a site."""
        if site_lat is None or site_lng is None:
            # Site not configured → record distance as 0 and flag invalid so it
            # surfaces for review rather than silently passing.
            return 0.0, False
        distance = haversine_m(lat, lng, site_lat, site_lng)
        if accuracy_m is not None and accuracy_m > _UNRELIABLE_ACCURACY_M:
            return distance, False
        buffer = min(accuracy_m or 0.0, _MAX_ACCURACY_BUFFER_M)
        is_valid = distance <= site_radius_m + buffer
        return distance, is_valid

    def _evaluate(
        self, project: Project, lat: float, lng: float, accuracy_m: float | None
    ) -> tuple[float, bool]:
        return self._evaluate_site(
            project.site_lat, project.site_lng, project.site_radius_m, lat, lng, accuracy_m
        )

    async def _evaluate_record(
        self, record: AttendanceRecord, lat: float, lng: float, accuracy_m: float | None
    ) -> tuple[float, bool]:
        """Evaluate a coordinate against whatever site the record belongs to."""
        if record.mode == "company":
            if record.customer_company_id is not None:
                cc = await self._session.get(
                    CustomerCompany, record.customer_company_id
                )
                if cc is None:
                    return 0.0, False
                return self._evaluate_site(
                    cc.site_lat, cc.site_lng, cc.site_radius_m, lat, lng, accuracy_m
                )
            if record.company_id is not None:
                company = await self._get_company(record.company_id)
                return self._evaluate_site(
                    company.site_lat, company.site_lng, company.site_radius_m,
                    lat, lng, accuracy_m,
                )
        project = await self._get_project(record.project_id)  # type: ignore[arg-type]
        return self._evaluate(project, lat, lng, accuracy_m)

    async def _open_record(self, user_id: uuid.UUID) -> AttendanceRecord | None:
        """Most recent record for this user that has not checked out.

        Scoped to the user (not project/company) so a worker can only have one
        open shift at a time across every site — they must check out of the
        current site before checking in anywhere else.
        """
        result = await self._session.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.check_out_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        )
        return result.scalars().first()

    @staticmethod
    def _capped_hours(check_in_at: datetime, check_out_at: datetime) -> tuple[float, bool]:
        """Elapsed hours between two times, capped at MAX_SHIFT_HOURS.

        Returns (hours, is_capped). A negative elapsed (clock skew) clamps to 0.
        """
        elapsed = (check_out_at - check_in_at).total_seconds() / 3600.0
        if elapsed < 0:
            return 0.0, False
        if elapsed > MAX_SHIFT_HOURS:
            return MAX_SHIFT_HOURS, True
        return round(elapsed, 2), False

    async def _auto_close_if_stale(self, record: AttendanceRecord) -> bool:
        """Auto-close an open record left over from a forgotten check-out.

        A forgotten check-out is NOT credited any hours — we do not know when the
        worker actually left, and auto-granting a full shift would be unfair and
        easy to abuse. The record is closed (so the worker can check in again),
        but `work_hours` stays NULL and it is flagged for a manager to confirm
        the real hours via `adjust_hours`. Past the check-out grace period it is
        additionally recorded as absent (vắng). Returns True if it was auto-closed.
        """
        now = datetime.now(timezone.utc)
        elapsed = (now - record.check_in_at).total_seconds() / 3600.0
        if elapsed <= MAX_SHIFT_HOURS:
            return False
        apply_auto_close(record, absent=elapsed > ABSENT_AFTER_HOURS)
        self._session.add(record)
        await self._session.flush()
        return True

    async def adjust_hours(
        self, record_id: uuid.UUID, work_hours: float, note: str | None = None
    ) -> AttendanceRecord:
        """Manager correction of work hours (e.g. for a forgotten check-out)."""
        record = await self._session.get(AttendanceRecord, record_id)
        if not record:
            raise HTTPException(404, "Attendance record not found")
        if work_hours < 0 or work_hours > MAX_SHIFT_HOURS:
            raise HTTPException(422, f"work_hours phải trong khoảng 0–{MAX_SHIFT_HOURS}")
        record.work_hours = round(work_hours, 2)
        record.is_auto_closed = False  # reviewed
        record.is_absent = False  # manager credited hours → no longer absent
        if note:
            record.note = " ".join(filter(None, [record.note, note]))
        self._session.add(record)
        await self._session.flush()
        return record

    async def check_in(
        self,
        user: User,
        lat: float,
        lng: float,
        accuracy_m: float | None,
        photo_url: str,
        mode: str = "project",
        project_id: uuid.UUID | None = None,
        company_id: uuid.UUID | None = None,
        customer_company_id: uuid.UUID | None = None,
        task_label: str | None = None,
        note: str | None = None,
    ) -> AttendanceRecord:
        # Validate the target site and membership depending on the mode.
        if mode == "company":
            task_label = (task_label or "").strip() or None
            if not task_label:
                raise HTTPException(422, "Hãy nhập công việc khi chấm công theo công ty")
            if customer_company_id is not None:
                # Check in at a customer company's site (validate vs its coords).
                cc = await self._get_customer_company(customer_company_id, user)
                distance, valid = self._evaluate_site(
                    cc.site_lat, cc.site_lng, cc.site_radius_m, lat, lng, accuracy_m,
                )
                company_id = None
            elif company_id is not None:
                company = await self._get_company(company_id)
                await self._ensure_company_member(user, company)
                distance, valid = self._evaluate_site(
                    company.site_lat, company.site_lng, company.site_radius_m,
                    lat, lng, accuracy_m,
                )
            else:
                raise HTTPException(
                    422, "Hãy chọn công ty hoặc công ty khách hàng khi chấm công theo công ty"
                )
            project_id = None
        else:
            mode = "project"
            if project_id is None:
                raise HTTPException(422, "project_id là bắt buộc khi chấm công theo công trình")
            project = await self._get_project(project_id)
            await self._ensure_member(user, project)
            distance, valid = self._evaluate(project, lat, lng, accuracy_m)
            company_id = None
            customer_company_id = None
            task_label = None

        open_rec = await self._open_record(user.id)
        if open_rec:
            # Forgotten check-out from a previous shift → auto-close and allow
            # the new check-in. A genuinely current shift still blocks.
            if not await self._auto_close_if_stale(open_rec):
                raise HTTPException(
                    409,
                    "Bạn đang có 1 ca chưa chấm công ra. Hãy chấm công ra trước.",
                )
        now = datetime.now(timezone.utc)
        record = AttendanceRecord(
            user_id=user.id,
            mode=mode,
            project_id=project_id,
            company_id=company_id,
            customer_company_id=customer_company_id,
            task_label=task_label,
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

        now = datetime.now(timezone.utc)
        distance, valid = await self._evaluate_record(record, lat, lng, accuracy_m)

        record.check_out_at = now
        record.check_out_lat = lat
        record.check_out_lng = lng
        record.check_out_accuracy_m = accuracy_m
        record.check_out_distance_m = distance
        record.check_out_valid = valid
        record.check_out_photo_url = photo_url
        hours, capped = self._capped_hours(record.check_in_at, now)
        record.work_hours = hours
        record.is_capped = capped

        # KPI scoring — use company shift config if available, else defaults
        company_id = record.company_id
        if company_id is None and record.project_id:
            proj = await self._session.get(Project, record.project_id)
            if proj:
                company_id = proj.company_id
        cfg_row = await self._session.get(AttendanceShiftConfig, company_id) if company_id else None
        cfg = ShiftThresholds(
            check_in_deadline=cfg_row.check_in_deadline if cfg_row else ShiftThresholds().check_in_deadline,
            check_out_earliest=cfg_row.check_out_earliest if cfg_row else ShiftThresholds().check_out_earliest,
            tolerance_minutes=cfg_row.tolerance_minutes if cfg_row else ShiftThresholds().tolerance_minutes,
            half_day_minutes=cfg_row.half_day_minutes if cfg_row else ShiftThresholds().half_day_minutes,
            full_day_minutes=cfg_row.full_day_minutes if cfg_row else ShiftThresholds().full_day_minutes,
            tz=cfg_row.timezone if cfg_row else ShiftThresholds().tz,
        )
        kpi = score_attendance(record.check_in_at, now, cfg)
        record.deviation_minutes = kpi.deviation_minutes
        record.attendance_flag = kpi.attendance_flag
        record.attendance_label = kpi.attendance_label
        record.kpi_weight = kpi.kpi_weight

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

    async def ensure_company_access(self, user: User, company_id: uuid.UUID) -> None:
        """Guard cross-tenant reads: the requester must be a superuser or a
        member of the company whose attendance they are listing.

        The ATTENDANCE_VIEW_TEAM permission is evaluated against the requester's
        own company scope, so on its own it does not stop a manager from passing
        another company's id in the path — this check closes that gap.
        """
        if user.is_superuser:
            return
        result = await self._session.execute(
            select(UserCompanyRole.user_id).where(
                UserCompanyRole.user_id == user.id,
                UserCompanyRole.company_id == company_id,
            )
        )
        if result.scalars().first() is None:
            raise HTTPException(403, "You do not have access to this company")

    async def list_for_company(
        self, company_id: uuid.UUID, date_from=None, date_to=None
    ) -> list[dict]:
        """List attendance for every member of a company, enriched with the
        employee name and a human-readable location label.

        Scoped by company *membership* (UserCompanyRole), so a worker's records
        show up here regardless of which site they checked in at — that is what
        a director wants when reviewing their own staff.
        """
        member_result = await self._session.execute(
            select(UserCompanyRole.user_id).where(
                UserCompanyRole.company_id == company_id
            )
        )
        member_ids = {row[0] for row in member_result.all()}
        if not member_ids:
            return []

        stmt = select(AttendanceRecord).where(
            AttendanceRecord.user_id.in_(member_ids)  # type: ignore[attr-defined]
        )
        if date_from is not None:
            stmt = stmt.where(AttendanceRecord.work_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(AttendanceRecord.work_date <= date_to)
        stmt = stmt.order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        result = await self._session.execute(stmt)
        records = list(result.scalars().all())
        if not records:
            return []

        # Batch-load the related entities needed to label each row.
        user_ids = {r.user_id for r in records}
        project_ids = {r.project_id for r in records if r.project_id}
        company_ids = {r.company_id for r in records if r.company_id}
        customer_ids = {
            r.customer_company_id for r in records if r.customer_company_id
        }

        users = {
            u.id: u
            for u in (
                await self._session.execute(
                    select(User).where(User.id.in_(user_ids))  # type: ignore[attr-defined]
                )
            ).scalars()
        }
        projects = (
            {
                p.id: p.name
                for p in (
                    await self._session.execute(
                        select(Project).where(Project.id.in_(project_ids))  # type: ignore[attr-defined]
                    )
                ).scalars()
            }
            if project_ids
            else {}
        )
        companies = (
            {
                c.id: c.name
                for c in (
                    await self._session.execute(
                        select(Company).where(Company.id.in_(company_ids))  # type: ignore[attr-defined]
                    )
                ).scalars()
            }
            if company_ids
            else {}
        )
        customers = (
            {
                cc.id: cc.name
                for cc in (
                    await self._session.execute(
                        select(CustomerCompany).where(
                            CustomerCompany.id.in_(customer_ids)  # type: ignore[attr-defined]
                        )
                    )
                ).scalars()
            }
            if customer_ids
            else {}
        )

        def _label(rec: AttendanceRecord) -> str:
            if rec.mode == "company":
                if rec.customer_company_id:
                    return customers.get(rec.customer_company_id) or "Công ty khách hàng"
                if rec.company_id:
                    return companies.get(rec.company_id) or "Công ty"
                return "Công ty"
            if rec.project_id:
                return projects.get(rec.project_id) or "Công trình"
            return "Công trình"

        enriched: list[dict] = []
        for rec in records:
            user = users.get(rec.user_id)
            data = rec.model_dump()
            data["user_name"] = user.full_name if user else None
            data["user_email"] = user.email if user else None
            data["location_label"] = _label(rec)
            enriched.append(data)
        return enriched

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

    async def set_company_site_location(
        self,
        company_id: uuid.UUID,
        site_lat: float | None,
        site_lng: float | None,
        site_radius_m: int | None,
    ) -> Company:
        company = await self._get_company(company_id)
        company.site_lat = site_lat
        company.site_lng = site_lng
        if site_radius_m is not None:
            company.site_radius_m = site_radius_m
        self._session.add(company)
        await self._session.flush()
        return company

    async def list_task_suggestions(self, user_id: uuid.UUID, limit: int = 20) -> list[str]:
        """Distinct company-mode task labels this user has used before."""
        result = await self._session.execute(
            select(AttendanceRecord.task_label)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.task_label.is_not(None),  # type: ignore[union-attr]
            )
            .order_by(AttendanceRecord.check_in_at.desc())  # type: ignore[union-attr]
        )
        seen: list[str] = []
        for label in result.scalars().all():
            if label and label not in seen:
                seen.append(label)
            if len(seen) >= limit:
                break
        return seen
