"""Service xử lý yêu cầu thay đổi kỹ năng."""
from __future__ import annotations

import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.skill import Skill, UserSkill
from app.models.skill_request import SkillChangeRequest
from app.models.user import User
from app.services.push_service import send_push_bg
from app.shared.permission import DIRECTOR_ROLE_NAMES

_ENTITY_TYPE = "skill_request"


async def _director_and_manager_ids(session: AsyncSession, company_id: uuid.UUID) -> list[uuid.UUID]:
    """Tất cả user có role level ≤ 2 (quản lý/giám đốc) trong công ty."""
    from app.models.org import Role, UserCompanyRole as UserRole
    rows = await session.execute(
        select(UserRole.user_id)
        .join(Role, UserRole.role_id == Role.id)
        .where(
            UserRole.company_id == company_id,
            (Role.level <= 2) | (Role.name.in_(DIRECTOR_ROLE_NAMES)),  # type: ignore[arg-type]
        )
    )
    return list({r[0] for r in rows.all()})


async def _notify(
    session: AsyncSession,
    user_id: uuid.UUID,
    notif_type: str,
    title: str,
    body: str,
    entity_id: uuid.UUID,
) -> None:
    try:
        notif = Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            body=body,
            entity_type=_ENTITY_TYPE,
            entity_id=entity_id,
        )
        session.add(notif)
        await session.flush()
        asyncio.create_task(send_push_bg(user_id, title, body, _ENTITY_TYPE, entity_id))
    except Exception:
        pass


async def submit_request(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    requested_skills: list[dict],
) -> SkillChangeRequest:
    """Nhân viên gửi yêu cầu thay đổi kỹ năng."""
    req = SkillChangeRequest(
        user_id=user_id,
        requested_by=user_id,
        company_id=company_id,
        requested_skills=requested_skills,
        status="pending",
    )
    session.add(req)
    await session.flush()

    # Thông báo tất cả quản lý/giám đốc
    user = await session.get(User, user_id)
    user_name = user.full_name or user.email if user else "Nhân viên"
    approvers = await _director_and_manager_ids(session, company_id)
    for approver_id in approvers:
        if approver_id != user_id:
            await _notify(
                session, approver_id, "skill_request_pending",
                "Yêu cầu cập nhật kỹ năng",
                f"{user_name} đề xuất cập nhật {len(requested_skills)} kỹ năng — cần duyệt",
                req.id,
            )
    return req


async def approve_request(
    session: AsyncSession,
    *,
    request_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    company_id: uuid.UUID,
) -> SkillChangeRequest:
    """Duyệt yêu cầu → apply skills ngay."""
    req = await session.get(SkillChangeRequest, request_id)
    if not req or req.company_id != company_id:
        raise HTTPException(404)
    if req.status != "pending":
        raise HTTPException(400, detail="Yêu cầu này đã được xử lý.")

    # Apply skills: xóa cũ → thêm mới
    existing = await session.execute(
        select(UserSkill).where(UserSkill.user_id == req.user_id, UserSkill.company_id == company_id)
    )
    for us in existing.scalars().all():
        await session.delete(us)

    for item in req.requested_skills:
        skill_id = uuid.UUID(item["skill_id"]) if isinstance(item["skill_id"], str) else item["skill_id"]
        session.add(UserSkill(
            user_id=req.user_id,
            skill_id=skill_id,
            company_id=company_id,
            level=int(item.get("level", 1)),
        ))

    req.status = "approved"
    req.reviewed_by = reviewer_id
    await session.flush()

    # Thông báo nhân viên
    reviewer = await session.get(User, reviewer_id)
    reviewer_name = reviewer.full_name or reviewer.email if reviewer else "Quản lý"
    await _notify(
        session, req.user_id, "skill_request_approved",
        "Kỹ năng đã được duyệt",
        f"{reviewer_name} đã duyệt yêu cầu cập nhật kỹ năng của bạn",
        req.id,
    )
    return req


async def reject_request(
    session: AsyncSession,
    *,
    request_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    company_id: uuid.UUID,
    note: str | None,
) -> SkillChangeRequest:
    """Từ chối yêu cầu."""
    req = await session.get(SkillChangeRequest, request_id)
    if not req or req.company_id != company_id:
        raise HTTPException(404)
    if req.status != "pending":
        raise HTTPException(400, detail="Yêu cầu này đã được xử lý.")

    req.status = "rejected"
    req.reviewed_by = reviewer_id
    req.note = note
    await session.flush()

    reviewer = await session.get(User, reviewer_id)
    reviewer_name = reviewer.full_name or reviewer.email if reviewer else "Quản lý"
    await _notify(
        session, req.user_id, "skill_request_rejected",
        "Yêu cầu kỹ năng bị từ chối",
        f"{reviewer_name} đã từ chối yêu cầu của bạn" + (f": {note}" if note else ""),
        req.id,
    )
    return req
