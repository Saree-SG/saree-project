"""
Leave request model — employees submit time-off requests for approval.

An employee creates a LeaveRequest (status="pending"). The request is routed to
one or more approvers — by default the company directors, or a configured chain
(LeaveApproverConfig) supporting steps that run before/after each other. Each
approver step is tracked as a LeaveApprovalParticipant; every state change is
written to LeaveStageTransition as an audit trail.

This mirrors the attendance + quotation-approval patterns already in the codebase.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel

# Allowed value sets (kept as plain constants — mirrors quotation stage constants).
LEAVE_TYPES = ("annual", "sick", "unpaid")
LEAVE_STATUSES = ("pending", "approved", "rejected", "cancelled")
# Half-day marker for a single-day request: None | "am" | "pm".
LEAVE_HALF_DAYS = ("am", "pm")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------
class LeaveRequest(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)  # requester

    leave_type: str = Field(default="annual", max_length=20)  # annual | sick | unpaid
    start_date: date = Field(index=True)
    end_date: date = Field(index=True)
    # Only meaningful when start_date == end_date: "am" or "pm" half-day.
    half_day: str | None = Field(default=None, max_length=10)
    num_days: float                                  # computed server-side
    reason: str | None = Field(default=None, sa_type=Text)

    status: str = Field(default="pending", max_length=20, index=True)
    decided_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    decided_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    decision_note: str | None = Field(default=None, sa_type=Text)

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class LeaveApprovalParticipant(SQLModel, table=True):
    """An approver assigned to a leave request (supports multi-step chains)."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    leave_request_id: uuid.UUID = Field(foreign_key="leaverequest.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    step_order: int = Field(default=1)  # lower steps approve first (pre/post chain)
    role: str = Field(default="primary", max_length=20)  # primary | pre_approver | post_approver
    has_approved: bool = Field(default=False)
    decided_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class LeaveStageTransition(SQLModel, table=True):
    """Audit trail of every action taken on a leave request."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    leave_request_id: uuid.UUID = Field(foreign_key="leaverequest.id", index=True)
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    action: str = Field(max_length=50)  # submit | approve | reject | cancel
    note: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


class LeaveApproverConfig(SQLModel, table=True):
    """Per-company configuration of who may approve leave requests.

    Each row is one approver step. When a company has no rows, leave requests
    fall back to routing to every company director (role level 1).
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    step_order: int = Field(default=1)  # 1, 2, 3 ... pre/post ordering for the future
    # Exactly one of role / user should be set per row.
    approver_role_id: uuid.UUID | None = Field(default=None, foreign_key="role.id")
    approver_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class LeaveRequestCreate(SQLModel):
    leave_type: str = Field(default="annual", max_length=20)
    start_date: date
    end_date: date
    half_day: str | None = Field(default=None, max_length=10)
    reason: str | None = None


class LeaveDecisionRequest(SQLModel):
    """Body for approve / reject. `note` is required when rejecting."""

    note: str | None = None


class LeaveRequestPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    user_id: uuid.UUID
    leave_type: str
    start_date: date
    end_date: date
    half_day: str | None
    num_days: float
    reason: str | None
    status: str
    decided_by: uuid.UUID | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime
    # Enriched display fields
    user_name: str | None = None
    decided_by_name: str | None = None


class LeaveRequestsPublic(SQLModel):
    data: list[LeaveRequestPublic]
    count: int


class LeaveApproverConfigItem(SQLModel):
    """One configured approver step (input)."""

    step_order: int = 1
    approver_role_id: uuid.UUID | None = None
    approver_user_id: uuid.UUID | None = None


class LeaveApproverConfigUpdate(SQLModel):
    """Replace the whole approver chain for a company."""

    items: list[LeaveApproverConfigItem]


class LeaveApproverConfigPublic(SQLModel):
    id: uuid.UUID
    step_order: int
    approver_role_id: uuid.UUID | None
    approver_user_id: uuid.UUID | None
    is_active: bool
    # Enriched display fields
    approver_role_name: str | None = None
    approver_user_name: str | None = None


class LeaveApproverConfigListPublic(SQLModel):
    """The configured chain plus whether the default (directors) is in effect."""

    data: list[LeaveApproverConfigPublic]
    uses_default: bool
