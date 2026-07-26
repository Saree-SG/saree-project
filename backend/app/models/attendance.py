"""
Attendance model — site check-in / check-out with GPS verification.

Workers check in/out at the construction site. GPS coordinates are captured
from the device and validated against the project's site location (Haversine
distance vs. allowed radius). A photo is mandatory on each check-in/out as an
extra anti-fraud layer (PWA cannot detect mock-location providers).

`check_in_at` / `check_out_at` are stamped by the SERVER, never trusted from
the device clock. `work_hours` is computed at check-out.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AttendanceShiftConfig(SQLModel, table=True):
    """Per-company shift thresholds for KPI scoring (Bước 8).

    One row per company — created on demand via PATCH /attendance/shift-config.
    All times are in the company's local timezone.
    """

    company_id: uuid.UUID = Field(foreign_key="company.id", primary_key=True)
    check_in_deadline: time = Field(default=time(8, 0))    # late if after this
    check_out_earliest: time = Field(default=time(17, 0))  # early if before this
    tolerance_minutes: int = Field(default=10)             # grace ≤ this → ok
    half_day_minutes: int = Field(default=60)              # > this → half_day (kpi 0.5)
    full_day_minutes: int = Field(default=180)             # > this → full_day (kpi 0.0)
    timezone: str = Field(default="Asia/Ho_Chi_Minh", max_length=50)


class AttendanceRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    # "project" → check in against a project site (default, original behaviour);
    # "company" → check in against a company (e.g. helping out at another site),
    # with a free-text task describing the ad-hoc work.
    mode: str = Field(default="project", max_length=20)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="project.id", index=True)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id", index=True)
    # company-mode against a CUSTOMER company (worker at a customer's site).
    customer_company_id: uuid.UUID | None = Field(
        default=None, foreign_key="customercompany.id", index=True
    )
    task_label: str | None = Field(default=None, max_length=255)  # company-mode ad-hoc task
    work_date: date = Field(index=True)

    # Check-in (required)
    check_in_at: datetime = Field(sa_type=DateTime(timezone=True))  # type: ignore
    check_in_lat: float
    check_in_lng: float
    check_in_accuracy_m: float | None = None   # coords.accuracy from device
    check_in_distance_m: float                 # Haversine distance to site
    check_in_valid: bool                       # within (radius + accuracy)?
    check_in_photo_url: str = Field(max_length=1000)

    # Check-out (filled later)
    check_out_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    check_out_lat: float | None = None
    check_out_lng: float | None = None
    check_out_accuracy_m: float | None = None
    check_out_distance_m: float | None = None
    check_out_valid: bool | None = None
    check_out_photo_url: str | None = Field(default=None, max_length=1000)

    work_hours: float | None = None            # computed at check-out (capped at max shift)
    is_capped: bool = Field(default=False)      # elapsed exceeded max shift → hours capped
    is_auto_closed: bool = Field(default=False) # forgot to check out → auto-closed for review
    # Open past the check-out grace period (max shift + grace) → recorded as
    # absent (vắng); work_hours is NOT credited for that day.
    is_absent: bool = Field(default=False)
    # When the "please check out" reminder was pushed (dedup so the periodic job
    # does not re-notify every run while the shift sits in the reminder window).
    reminder_sent_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)  # type: ignore
    )
    note: str | None = Field(default=None, sa_type=Text)

    # KPI scoring fields (Bước 8) — computed at check-out using AttendanceShiftConfig
    # deviation_minutes: lệch giờ so với deadline/earliest (dương=trễ/về sớm, âm=đúng giờ)
    deviation_minutes: int = Field(default=0)
    # attendance_flag: ok | late | early | half_day | full_day
    attendance_flag: str = Field(default="ok", max_length=20)
    # attendance_label: "Đúng giờ" / "Đi trễ N phút" / "Về sớm N phút" / ...
    attendance_label: str | None = Field(default=None, max_length=100)
    # kpi_weight: 1.0 (ok/late/early) | 0.5 (half_day) | 0.0 (full_day)
    kpi_weight: float = Field(default=1.0)

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# Public / response schemas
# ---------------------------------------------------------------------------
class AttendanceRecordPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    mode: str
    project_id: uuid.UUID | None
    company_id: uuid.UUID | None
    customer_company_id: uuid.UUID | None
    task_label: str | None
    work_date: date
    check_in_at: datetime
    check_in_lat: float
    check_in_lng: float
    check_in_accuracy_m: float | None
    check_in_distance_m: float
    check_in_valid: bool
    check_in_photo_url: str
    check_out_at: datetime | None
    check_out_lat: float | None
    check_out_lng: float | None
    check_out_accuracy_m: float | None
    check_out_distance_m: float | None
    check_out_valid: bool | None
    check_out_photo_url: str | None
    work_hours: float | None
    is_capped: bool
    is_auto_closed: bool
    is_absent: bool
    reminder_sent_at: datetime | None
    note: str | None
    deviation_minutes: int = 0
    attendance_flag: str = "ok"
    attendance_label: str | None = None
    kpi_weight: float = 1.0
    created_at: datetime


class AttendanceShiftConfigPublic(SQLModel):
    company_id: uuid.UUID
    check_in_deadline: time
    check_out_earliest: time
    tolerance_minutes: int
    half_day_minutes: int
    full_day_minutes: int
    timezone: str


class AttendanceRecordsPublic(SQLModel):
    data: list[AttendanceRecordPublic]
    count: int


class AttendanceTeamRecordPublic(AttendanceRecordPublic):
    """A team attendance record enriched with the employee's name and a
    human-readable location label (project / company / customer company),
    for the manager-facing company attendance view."""

    user_name: str | None = None
    user_email: str | None = None
    location_label: str | None = None


class AttendanceTeamRecordsPublic(SQLModel):
    data: list[AttendanceTeamRecordPublic]
    count: int


class SiteLocationUpdate(SQLModel):
    """Set/clear a project's site coordinates and allowed radius."""

    site_lat: float | None = None
    site_lng: float | None = None
    site_radius_m: int | None = Field(default=None, ge=10, le=5000)
