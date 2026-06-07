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
from datetime import date, datetime, timezone

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    note: str | None = Field(default=None, sa_type=Text)

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
    note: str | None
    created_at: datetime


class AttendanceRecordsPublic(SQLModel):
    data: list[AttendanceRecordPublic]
    count: int


class SiteLocationUpdate(SQLModel):
    """Set/clear a project's site coordinates and allowed radius."""

    site_lat: float | None = None
    site_lng: float | None = None
    site_radius_m: int | None = Field(default=None, ge=10, le=5000)
