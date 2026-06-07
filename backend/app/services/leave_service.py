"""
Leave service — employee time-off requests with a configurable approval chain.

A request is routed to one or more approver *steps*. By default (no company
configuration) it routes to every company director; a company can instead
configure an explicit chain (LeaveApproverConfig) of roles/users with a
step_order, allowing approvers before/after each other.

Approval semantics (v1):
  * Steps are processed in ascending step_order.
  * A step is *satisfied* when ANY participant at that step approves — so the
    director fallback (several directors at step 1) needs only one approval.
  * The request is approved once every step is satisfied; a reject at the
    current step rejects the whole request.

Mirrors the attendance service shape (AsyncSession + flush()) and the quotation
approval/notify/audit patterns.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.leave_request import (
    LEAVE_HALF_DAYS,
    LEAVE_TYPES,
    LeaveApprovalParticipant,
    LeaveApproverConfig,
    LeaveApproverConfigItem,
    LeaveRequest,
    LeaveRequestCreate,
    LeaveStageTransition,
)
from app.models.notification import Notification
from app.models.org import Role, UserCompanyRole
from app.models.user import User
from app.services.push_service import send_push_bg
from app.shared.permission import DIRECTOR_ROLE_NAMES

_ENTITY_TYPE = "leave"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LeaveService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _notify(
        self,
        user_id: uuid.UUID,
        notif_type: str,
        title: str,
        body: str,
        entity_id: uuid.UUID,
    ) -> None:
        """Persist a notification + fire a background web-push (best effort)."""
        try:
            notif = Notification(
                user_id=user_id,
                type=notif_type,
                title=title,
                body=body,
                entity_type=_ENTITY_TYPE,
                entity_id=entity_id,
            )
            self._session.add(notif)
            await self._session.flush()
            asyncio.create_task(
                send_push_bg(user_id, title, body, _ENTITY_TYPE, entity_id)
            )
        except Exception:
            logger.exception(
                "Failed to persist leave notification user_id={} type={}",
                user_id,
                notif_type,
            )

    @staticmethod
    def _compute_num_days(start: date, end: date, half_day: str | None) -> float:
        """Inclusive calendar-day count, minus a half-day for a single-day request.

        v1 counts calendar days (weekends/holidays are not excluded — TODO when a
        company calendar exists). A half-day only applies to a one-day request.
        """
        if end < start:
            raise HTTPException(422, "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.")
        total = (end - start).days + 1
        if half_day:
            if start != end:
                raise HTTPException(
                    422, "Chỉ áp dụng nghỉ nửa ngày cho đơn nghỉ trong 1 ngày."
                )
            return 0.5
        return float(total)

    async def _director_user_ids(self, company_id: uuid.UUID) -> list[uuid.UUID]:
        """All users holding a director-scope role (level 1 / director) in company."""
        result = await self._session.execute(
            select(UserCompanyRole.user_id)
            .join(Role, Role.id == UserCompanyRole.role_id)
            .where(
                UserCompanyRole.company_id == company_id,
                (Role.level == 1) | (Role.name.in_(DIRECTOR_ROLE_NAMES)),  # type: ignore[arg-type]
            )
        )
        return list({row[0] for row in result.all()})

    async def _role_user_ids(
        self, company_id: uuid.UUID, role_id: uuid.UUID
    ) -> list[uuid.UUID]:
        result = await self._session.execute(
            select(UserCompanyRole.user_id).where(
                UserCompanyRole.company_id == company_id,
                UserCompanyRole.role_id == role_id,
            )
        )
        return list({row[0] for row in result.all()})

    async def _resolve_approver_steps(
        self, company_id: uuid.UUID
    ) -> list[tuple[int, uuid.UUID]]:
        """Return ordered (step_order, user_id) pairs for the company's chain.

        Falls back to a single step of all directors when nothing is configured.
        """
        result = await self._session.execute(
            select(LeaveApproverConfig)
            .where(
                LeaveApproverConfig.company_id == company_id,
                LeaveApproverConfig.is_active == True,  # noqa: E712
            )
            .order_by(LeaveApproverConfig.step_order)  # type: ignore[arg-type]
        )
        configs = list(result.scalars().all())

        pairs: list[tuple[int, uuid.UUID]] = []
        seen: set[tuple[int, uuid.UUID]] = set()
        for cfg in configs:
            user_ids: list[uuid.UUID] = []
            if cfg.approver_user_id is not None:
                user_ids = [cfg.approver_user_id]
            elif cfg.approver_role_id is not None:
                user_ids = await self._role_user_ids(company_id, cfg.approver_role_id)
            for uid in user_ids:
                key = (cfg.step_order, uid)
                if key not in seen:
                    seen.add(key)
                    pairs.append(key)

        if not pairs:
            for uid in await self._director_user_ids(company_id):
                pairs.append((1, uid))
        return pairs

    async def _participants(
        self, leave_request_id: uuid.UUID
    ) -> list[LeaveApprovalParticipant]:
        result = await self._session.execute(
            select(LeaveApprovalParticipant)
            .where(LeaveApprovalParticipant.leave_request_id == leave_request_id)
            .order_by(LeaveApprovalParticipant.step_order)  # type: ignore[arg-type]
        )
        return list(result.scalars().all())

    @staticmethod
    def _active_step(parts: list[LeaveApprovalParticipant]) -> int | None:
        """Smallest step_order not yet satisfied (no participant approved at it)."""
        steps = sorted({p.step_order for p in parts})
        for step in steps:
            if not any(p.has_approved for p in parts if p.step_order == step):
                return step
        return None  # every step satisfied

    async def _add_transition(
        self, leave_request_id: uuid.UUID, actor_id: uuid.UUID, action: str, note: str | None
    ) -> None:
        self._session.add(
            LeaveStageTransition(
                leave_request_id=leave_request_id,
                actor_id=actor_id,
                action=action,
                note=note,
            )
        )
        await self._session.flush()

    async def _can_decide(
        self, leq: LeaveRequest, user: User, parts: list[LeaveApprovalParticipant]
    ) -> bool:
        """A director/superuser may always decide; otherwise must be a participant."""
        if user.is_superuser:
            return True
        if user.id in await self._director_user_ids(leq.company_id):
            return True
        return any(p.user_id == user.id for p in parts)

    # ------------------------------------------------------------------
    # Enrichment
    # ------------------------------------------------------------------
    async def _enrich(self, items: list[LeaveRequest]) -> list[LeaveRequest]:
        """No-op placeholder kept for symmetry; enrichment done in to_public."""
        return items

    async def to_public_list(self, items: list[LeaveRequest]) -> list[dict]:
        """Build enriched dicts (user_name, decided_by_name) for a list."""
        ids: set[uuid.UUID] = set()
        for it in items:
            ids.add(it.user_id)
            if it.decided_by:
                ids.add(it.decided_by)
        users = {}
        if ids:
            result = await self._session.execute(
                select(User).where(User.id.in_(ids))  # type: ignore[arg-type]
            )
            users = {u.id: u for u in result.scalars().all()}

        def name(uid: uuid.UUID | None) -> str | None:
            u = users.get(uid) if uid else None
            return (u.full_name or u.email) if u else None

        out: list[dict] = []
        for it in items:
            out.append(
                {
                    "id": it.id,
                    "company_id": it.company_id,
                    "user_id": it.user_id,
                    "leave_type": it.leave_type,
                    "start_date": it.start_date,
                    "end_date": it.end_date,
                    "half_day": it.half_day,
                    "num_days": it.num_days,
                    "reason": it.reason,
                    "status": it.status,
                    "decided_by": it.decided_by,
                    "decided_at": it.decided_at,
                    "decision_note": it.decision_note,
                    "created_at": it.created_at,
                    "user_name": name(it.user_id),
                    "decided_by_name": name(it.decided_by),
                }
            )
        return out

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------
    async def create_request(
        self, user: User, body: LeaveRequestCreate
    ) -> LeaveRequest:
        if user.company_id is None:
            raise HTTPException(422, "Tài khoản chưa thuộc công ty nào.")
        if body.leave_type not in LEAVE_TYPES:
            raise HTTPException(422, f"Loại nghỉ không hợp lệ: {body.leave_type}")
        half_day = (body.half_day or None)
        if half_day is not None and half_day not in LEAVE_HALF_DAYS:
            raise HTTPException(422, "Giá trị nửa ngày không hợp lệ (am/pm).")
        num_days = self._compute_num_days(body.start_date, body.end_date, half_day)

        leq = LeaveRequest(
            company_id=user.company_id,
            user_id=user.id,
            leave_type=body.leave_type,
            start_date=body.start_date,
            end_date=body.end_date,
            half_day=half_day,
            num_days=num_days,
            reason=(body.reason or None),
            status="pending",
        )
        self._session.add(leq)
        await self._session.flush()

        steps = await self._resolve_approver_steps(user.company_id)
        # Don't make the requester approve their own request.
        steps = [(s, uid) for (s, uid) in steps if uid != user.id]
        for step_order, uid in steps:
            self._session.add(
                LeaveApprovalParticipant(
                    leave_request_id=leq.id,
                    user_id=uid,
                    step_order=step_order,
                    role="primary",
                )
            )
        await self._session.flush()

        await self._add_transition(leq.id, user.id, "submit", body.reason)

        # Notify the first step's approvers.
        parts = await self._participants(leq.id)
        active = self._active_step(parts)
        if active is not None:
            for p in parts:
                if p.step_order == active:
                    await self._notify(
                        p.user_id,
                        "leave_request_submitted",
                        "Đơn xin nghỉ mới cần duyệt",
                        f"{user.full_name or user.email} xin nghỉ "
                        f"{num_days} ngày ({body.start_date} → {body.end_date}).",
                        leq.id,
                    )
        return leq

    async def _get_or_404(self, leave_request_id: uuid.UUID) -> LeaveRequest:
        leq = await self._session.get(LeaveRequest, leave_request_id)
        if leq is None:
            raise HTTPException(404, "Không tìm thấy đơn nghỉ.")
        return leq

    async def approve(
        self, leave_request_id: uuid.UUID, user: User, note: str | None
    ) -> LeaveRequest:
        leq = await self._get_or_404(leave_request_id)
        if leq.status != "pending":
            raise HTTPException(409, "Đơn nghỉ đã được xử lý.")
        parts = await self._participants(leq.id)
        if not await self._can_decide(leq, user, parts):
            raise HTTPException(403, "Bạn không có quyền duyệt đơn nghỉ này.")

        active = self._active_step(parts)
        now = _utcnow()
        # Mark this approver's participant row (at the active step) as approved.
        for p in parts:
            if p.user_id == user.id and not p.has_approved and (
                active is None or p.step_order == active
            ):
                p.has_approved = True
                p.decided_at = now
                self._session.add(p)
        await self._session.flush()

        parts = await self._participants(leq.id)
        next_active = self._active_step(parts)

        await self._add_transition(leq.id, user.id, "approve", note)

        if next_active is None:
            # Every step satisfied → approved.
            leq.status = "approved"
            leq.decided_by = user.id
            leq.decided_at = now
            leq.decision_note = note
            self._session.add(leq)
            await self._session.flush()
            await self._notify(
                leq.user_id,
                "leave_request_approved",
                "Đơn xin nghỉ đã được duyệt",
                f"Đơn nghỉ {leq.start_date} → {leq.end_date} đã được duyệt.",
                leq.id,
            )
        else:
            # Advance to the next step → notify its approvers.
            for p in parts:
                if p.step_order == next_active:
                    await self._notify(
                        p.user_id,
                        "leave_request_submitted",
                        "Đơn xin nghỉ cần bạn duyệt",
                        f"Đơn nghỉ {leq.start_date} → {leq.end_date} đã qua bước "
                        f"trước, chờ bạn duyệt.",
                        leq.id,
                    )
        return leq

    async def reject(
        self, leave_request_id: uuid.UUID, user: User, note: str | None
    ) -> LeaveRequest:
        leq = await self._get_or_404(leave_request_id)
        if leq.status != "pending":
            raise HTTPException(409, "Đơn nghỉ đã được xử lý.")
        if not note or not note.strip():
            raise HTTPException(422, "Phải nhập lý do khi từ chối đơn nghỉ.")
        parts = await self._participants(leq.id)
        if not await self._can_decide(leq, user, parts):
            raise HTTPException(403, "Bạn không có quyền từ chối đơn nghỉ này.")

        now = _utcnow()
        leq.status = "rejected"
        leq.decided_by = user.id
        leq.decided_at = now
        leq.decision_note = note
        self._session.add(leq)
        await self._session.flush()
        await self._add_transition(leq.id, user.id, "reject", note)
        await self._notify(
            leq.user_id,
            "leave_request_rejected",
            "Đơn xin nghỉ bị từ chối",
            f"Đơn nghỉ {leq.start_date} → {leq.end_date} bị từ chối: {note}",
            leq.id,
        )
        return leq

    async def cancel(self, leave_request_id: uuid.UUID, user: User) -> LeaveRequest:
        leq = await self._get_or_404(leave_request_id)
        if leq.user_id != user.id and not user.is_superuser:
            raise HTTPException(403, "Chỉ người tạo mới có thể hủy đơn nghỉ.")
        if leq.status != "pending":
            raise HTTPException(409, "Chỉ có thể hủy đơn đang chờ duyệt.")
        leq.status = "cancelled"
        leq.decided_at = _utcnow()
        self._session.add(leq)
        await self._session.flush()
        await self._add_transition(leq.id, user.id, "cancel", None)
        return leq

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------
    async def list_for_user(
        self,
        user_id: uuid.UUID,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[LeaveRequest]:
        stmt = select(LeaveRequest).where(LeaveRequest.user_id == user_id)
        if status:
            stmt = stmt.where(LeaveRequest.status == status)
        if date_from is not None:
            stmt = stmt.where(LeaveRequest.end_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(LeaveRequest.start_date <= date_to)
        stmt = stmt.order_by(LeaveRequest.created_at.desc())  # type: ignore[union-attr]
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_pending_for_approver(self, user: User) -> list[LeaveRequest]:
        """Pending requests the user must act on.

        Directors see all pending requests in their company; others see only the
        requests where they are an assigned participant at the active step.
        """
        company_id = user.company_id
        if company_id is None and not user.is_superuser:
            return []

        if user.is_superuser or (
            company_id is not None
            and user.id in await self._director_user_ids(company_id)
        ):
            stmt = select(LeaveRequest).where(LeaveRequest.status == "pending")
            if company_id is not None and not user.is_superuser:
                stmt = stmt.where(LeaveRequest.company_id == company_id)
            stmt = stmt.order_by(LeaveRequest.created_at.desc())  # type: ignore[union-attr]
            result = await self._session.execute(stmt)
            return list(result.scalars().all())

        # Participant-based: requests where this user is assigned and pending.
        result = await self._session.execute(
            select(LeaveRequest)
            .join(
                LeaveApprovalParticipant,
                LeaveApprovalParticipant.leave_request_id == LeaveRequest.id,
            )
            .where(
                LeaveApprovalParticipant.user_id == user.id,
                LeaveRequest.status == "pending",
            )
            .order_by(LeaveRequest.created_at.desc())  # type: ignore[union-attr]
        )
        candidates_by_id: dict[uuid.UUID, LeaveRequest] = {}
        for leq in result.scalars().all():
            candidates_by_id.setdefault(leq.id, leq)
        # Only those where the user's step is the active one.
        out: list[LeaveRequest] = []
        for leq in candidates_by_id.values():
            parts = await self._participants(leq.id)
            active = self._active_step(parts)
            if active is not None and any(
                p.user_id == user.id and p.step_order == active for p in parts
            ):
                out.append(leq)
        return out

    async def list_for_company(
        self,
        company_id: uuid.UUID,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[LeaveRequest]:
        stmt = select(LeaveRequest).where(LeaveRequest.company_id == company_id)
        if status:
            stmt = stmt.where(LeaveRequest.status == status)
        if date_from is not None:
            stmt = stmt.where(LeaveRequest.end_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(LeaveRequest.start_date <= date_to)
        stmt = stmt.order_by(LeaveRequest.created_at.desc())  # type: ignore[union-attr]
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Approver configuration
    # ------------------------------------------------------------------
    async def get_approver_config(
        self, company_id: uuid.UUID
    ) -> tuple[list[LeaveApproverConfig], bool, dict[uuid.UUID, str], dict[uuid.UUID, str]]:
        """Return (rows, uses_default, role_names, user_names) for display."""
        result = await self._session.execute(
            select(LeaveApproverConfig)
            .where(LeaveApproverConfig.company_id == company_id)
            .order_by(LeaveApproverConfig.step_order)  # type: ignore[arg-type]
        )
        rows = list(result.scalars().all())
        uses_default = len([r for r in rows if r.is_active]) == 0

        role_ids = [r.approver_role_id for r in rows if r.approver_role_id]
        user_ids = [r.approver_user_id for r in rows if r.approver_user_id]
        role_names: dict[uuid.UUID, str] = {}
        user_names: dict[uuid.UUID, str] = {}
        if role_ids:
            res = await self._session.execute(
                select(Role).where(Role.id.in_(role_ids))  # type: ignore[arg-type]
            )
            role_names = {r.id: r.display_name for r in res.scalars().all()}
        if user_ids:
            res = await self._session.execute(
                select(User).where(User.id.in_(user_ids))  # type: ignore[arg-type]
            )
            user_names = {
                u.id: (u.full_name or u.email) for u in res.scalars().all()
            }
        return rows, uses_default, role_names, user_names

    async def set_approver_config(
        self, company_id: uuid.UUID, items: list[LeaveApproverConfigItem]
    ) -> None:
        """Replace the whole approver chain for the company."""
        # Validate each item references exactly one of role/user.
        for it in items:
            if bool(it.approver_role_id) == bool(it.approver_user_id):
                raise HTTPException(
                    422, "Mỗi bước duyệt phải chọn đúng một role HOẶC một người."
                )
        # Delete existing rows.
        existing = await self._session.execute(
            select(LeaveApproverConfig).where(
                LeaveApproverConfig.company_id == company_id
            )
        )
        for row in existing.scalars().all():
            await self._session.delete(row)
        await self._session.flush()
        # Insert the new chain.
        for it in items:
            self._session.add(
                LeaveApproverConfig(
                    company_id=company_id,
                    step_order=it.step_order,
                    approver_role_id=it.approver_role_id,
                    approver_user_id=it.approver_user_id,
                    is_active=True,
                )
            )
        await self._session.flush()
