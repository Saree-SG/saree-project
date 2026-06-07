"""Leave routes — employee time-off requests with a configurable approval chain."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.leave_request import (
    LeaveApproverConfigListPublic,
    LeaveApproverConfigPublic,
    LeaveApproverConfigUpdate,
    LeaveDecisionRequest,
    LeaveRequestCreate,
    LeaveRequestPublic,
    LeaveRequestsPublic,
)
from app.models.user import User
from app.services.leave_service import LeaveService
from app.shared.permission import require_permission

router = APIRouter(tags=["leave"])


def _svc(session: AsyncSession) -> LeaveService:
    return LeaveService(session)


async def _to_public(svc: LeaveService, records: list) -> LeaveRequestsPublic:
    data = [LeaveRequestPublic(**d) for d in await svc.to_public_list(records)]
    return LeaveRequestsPublic(data=data, count=len(data))


# ---------------------------------------------------------------------------
# Employee — own requests
# ---------------------------------------------------------------------------
@router.post("/leave-requests", response_model=LeaveRequestPublic, status_code=201)
async def create_leave_request(
    body: LeaveRequestCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_CREATE")),
) -> LeaveRequestPublic:
    """Create a leave request; it is routed to the company's approvers."""
    svc = _svc(session)
    leq = await svc.create_request(current_user, body)
    public = (await svc.to_public_list([leq]))[0]
    return LeaveRequestPublic(**public)


@router.get("/leave-requests/me", response_model=LeaveRequestsPublic)
async def my_leave_requests(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> LeaveRequestsPublic:
    """List the current user's own leave requests."""
    svc = _svc(session)
    records = await svc.list_for_user(current_user.id, status, date_from, date_to)
    return await _to_public(svc, records)


@router.post("/leave-requests/{request_id}/cancel", response_model=LeaveRequestPublic)
async def cancel_leave_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> LeaveRequestPublic:
    """Cancel one of your own pending leave requests."""
    svc = _svc(session)
    leq = await svc.cancel(request_id, current_user)
    public = (await svc.to_public_list([leq]))[0]
    return LeaveRequestPublic(**public)


# ---------------------------------------------------------------------------
# Approver — pending queue + decisions
# ---------------------------------------------------------------------------
@router.get("/leave-requests/pending", response_model=LeaveRequestsPublic)
async def pending_leave_requests(
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_APPROVE")),
) -> LeaveRequestsPublic:
    """Leave requests awaiting the current user's approval."""
    svc = _svc(session)
    records = await svc.list_pending_for_approver(current_user)
    return await _to_public(svc, records)


@router.post("/leave-requests/{request_id}/approve", response_model=LeaveRequestPublic)
async def approve_leave_request(
    request_id: uuid.UUID,
    body: LeaveDecisionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_APPROVE")),
) -> LeaveRequestPublic:
    """Approve a leave request (advances the chain or finalises it)."""
    svc = _svc(session)
    leq = await svc.approve(request_id, current_user, body.note)
    public = (await svc.to_public_list([leq]))[0]
    return LeaveRequestPublic(**public)


@router.post("/leave-requests/{request_id}/reject", response_model=LeaveRequestPublic)
async def reject_leave_request(
    request_id: uuid.UUID,
    body: LeaveDecisionRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_APPROVE")),
) -> LeaveRequestPublic:
    """Reject a leave request (requires a reason)."""
    svc = _svc(session)
    leq = await svc.reject(request_id, current_user, body.note)
    public = (await svc.to_public_list([leq]))[0]
    return LeaveRequestPublic(**public)


# ---------------------------------------------------------------------------
# Company-wide view (managers / HR)
# ---------------------------------------------------------------------------
@router.get(
    "/companies/{company_id}/leave-requests",
    response_model=LeaveRequestsPublic,
)
async def company_leave_requests(
    company_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_VIEW_TEAM")),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> LeaveRequestsPublic:
    """List all leave requests in a company (managers / HR)."""
    svc = _svc(session)
    records = await svc.list_for_company(company_id, status, date_from, date_to)
    return await _to_public(svc, records)


# ---------------------------------------------------------------------------
# Approver configuration (director+)
# ---------------------------------------------------------------------------
@router.get(
    "/companies/{company_id}/leave-approver-config",
    response_model=LeaveApproverConfigListPublic,
)
async def get_leave_approver_config(
    company_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_CONFIG")),
) -> LeaveApproverConfigListPublic:
    """Return the company's configured approver chain (or default note)."""
    svc = _svc(session)
    rows, uses_default, role_names, user_names = await svc.get_approver_config(
        company_id
    )
    data = [
        LeaveApproverConfigPublic(
            id=r.id,
            step_order=r.step_order,
            approver_role_id=r.approver_role_id,
            approver_user_id=r.approver_user_id,
            is_active=r.is_active,
            approver_role_name=role_names.get(r.approver_role_id)
            if r.approver_role_id
            else None,
            approver_user_name=user_names.get(r.approver_user_id)
            if r.approver_user_id
            else None,
        )
        for r in rows
    ]
    return LeaveApproverConfigListPublic(data=data, uses_default=uses_default)


@router.put(
    "/companies/{company_id}/leave-approver-config",
    response_model=LeaveApproverConfigListPublic,
)
async def set_leave_approver_config(
    company_id: uuid.UUID,
    body: LeaveApproverConfigUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("LEAVE_CONFIG")),
) -> LeaveApproverConfigListPublic:
    """Replace the company's approver chain."""
    svc = _svc(session)
    await svc.set_approver_config(company_id, body.items)
    rows, uses_default, role_names, user_names = await svc.get_approver_config(
        company_id
    )
    data = [
        LeaveApproverConfigPublic(
            id=r.id,
            step_order=r.step_order,
            approver_role_id=r.approver_role_id,
            approver_user_id=r.approver_user_id,
            is_active=r.is_active,
            approver_role_name=role_names.get(r.approver_role_id)
            if r.approver_role_id
            else None,
            approver_user_name=user_names.get(r.approver_user_id)
            if r.approver_user_id
            else None,
        )
        for r in rows
    ]
    return LeaveApproverConfigListPublic(data=data, uses_default=uses_default)
