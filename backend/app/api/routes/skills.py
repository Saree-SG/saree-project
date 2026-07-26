"""Skill catalogue + UserSkill management."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel as _BM
from sqlalchemy import select

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.skill import Skill, SkillCreate, SkillPublic, SkillUpdate, UserSkill, UserSkillPublic, UserSkillUpsert
from app.models.user import User
from app.shared.permission import has_permission, require_permission

router = APIRouter(prefix="/skills", tags=["skills"])


# ── Skill catalogue ───────────────────────────────────────────────────────────

@router.get("", response_model=list[SkillPublic])
async def list_skills(session: AsyncSessionDep, current_user: CurrentUser):
    result = await session.execute(
        select(Skill).where(Skill.company_id == current_user.company_id).order_by(Skill.category, Skill.name)
    )
    return result.scalars().all()


@router.post("", response_model=SkillPublic, status_code=status.HTTP_201_CREATED,
             dependencies=[__import__("fastapi", fromlist=["Depends"]).Depends(require_permission("ADMIN_MANAGE_COMPANY"))])
async def create_skill(body: SkillCreate, session: AsyncSessionDep, current_user: CurrentUser):
    skill = Skill(**body.model_dump(), company_id=current_user.company_id)
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@router.patch("/{skill_id}", response_model=SkillPublic,
              dependencies=[__import__("fastapi", fromlist=["Depends"]).Depends(require_permission("ADMIN_MANAGE_COMPANY"))])
async def update_skill(skill_id: uuid.UUID, body: SkillUpdate, session: AsyncSessionDep, current_user: CurrentUser):
    skill = await session.get(Skill, skill_id)
    if not skill or skill.company_id != current_user.company_id:
        raise HTTPException(404)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(skill, k, v)
    await session.commit()
    await session.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[__import__("fastapi", fromlist=["Depends"]).Depends(require_permission("ADMIN_MANAGE_COMPANY"))])
async def delete_skill(skill_id: uuid.UUID, session: AsyncSessionDep, current_user: CurrentUser):
    skill = await session.get(Skill, skill_id)
    if not skill or skill.company_id != current_user.company_id:
        raise HTTPException(404)
    await session.delete(skill)
    await session.commit()


# ── UserSkill ─────────────────────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=list[UserSkillPublic])
async def get_user_skills(user_id: uuid.UUID, session: AsyncSessionDep, current_user: CurrentUser):
    rows = await session.execute(
        select(UserSkill, Skill)
        .join(Skill, UserSkill.skill_id == Skill.id)
        .where(UserSkill.user_id == user_id, UserSkill.company_id == current_user.company_id)
        .order_by(Skill.category, Skill.name)
    )
    return [
        UserSkillPublic(
            id=us.id,
            user_id=us.user_id,
            skill_id=us.skill_id,
            skill_name=sk.name,
            skill_category=sk.category,
            level=us.level,
        )
        for us, sk in rows.all()
    ]


@router.put("/users/{user_id}", response_model=list[UserSkillPublic])
async def upsert_user_skills(
    user_id: uuid.UUID,
    body: list[UserSkillUpsert],
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    """Replace all skills for a user (full replace)."""
    user = await session.get(User, user_id)
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(404)
    can_manage = current_user.is_superuser or current_user.id == user_id
    if not can_manage:
        can_manage = await has_permission(session, current_user, "ADMIN_MANAGE_COMPANY")
    if not can_manage:
        raise HTTPException(403)

    # Xóa kỹ năng cũ
    existing = await session.execute(
        select(UserSkill).where(UserSkill.user_id == user_id, UserSkill.company_id == current_user.company_id)
    )
    for us in existing.scalars().all():
        await session.delete(us)

    # Thêm kỹ năng mới
    new_skills = [
        UserSkill(
            user_id=user_id,
            skill_id=item.skill_id,
            company_id=current_user.company_id,
            level=item.level,
        )
        for item in body
    ]
    for us in new_skills:
        session.add(us)

    # Flush để có id, framework sẽ tự commit khi kết thúc request
    await session.flush()

    rows = await session.execute(
        select(UserSkill, Skill)
        .join(Skill, UserSkill.skill_id == Skill.id)
        .where(UserSkill.user_id == user_id, UserSkill.company_id == current_user.company_id)
        .order_by(Skill.category, Skill.name)
    )
    return [
        UserSkillPublic(
            id=us.id,
            user_id=us.user_id,
            skill_id=us.skill_id,
            skill_name=sk.name,
            skill_category=sk.category,
            level=us.level,
        )
        for us, sk in rows.all()
    ]


# ── Yêu cầu thay đổi kỹ năng ─────────────────────────────────────────────────

from app.models.skill_request import SkillChangeRequest, SkillRequestPublic, SkillRequestReview, SkillRequestSubmit
from app.services import skill_request_service as _srs
from app.shared.permission import _is_company_director_role
from app.models.org import Role, UserCompanyRole as _UserRole


async def _is_director_or_manager(session: AsyncSessionDep, user) -> bool:
    if user.is_superuser:
        return True
    rows = await session.execute(
        select(Role).join(_UserRole, _UserRole.role_id == Role.id)
        .where(_UserRole.user_id == user.id, _UserRole.company_id == user.company_id)
    )
    roles = rows.scalars().all()
    return any(r.level <= 2 for r in roles)


@router.post("/requests", response_model=SkillRequestPublic, status_code=201)
async def submit_skill_request(
    body: SkillRequestSubmit,
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    """Nhân viên gửi yêu cầu thay đổi kỹ năng chờ quản lý duyệt."""
    req = await _srs.submit_request(
        session,
        user_id=current_user.id,
        company_id=current_user.company_id,
        requested_skills=body.requested_skills,
    )
    return SkillRequestPublic(
        id=req.id,
        user_id=req.user_id,
        requested_skills=req.requested_skills,
        status=req.status,
        note=req.note,
        created_at=req.created_at,
    )


@router.get("/requests/pending", response_model=list[SkillRequestPublic])
async def list_pending_skill_requests(
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    """Quản lý/giám đốc xem danh sách yêu cầu đang chờ duyệt."""
    if not await _is_director_or_manager(session, current_user):
        raise HTTPException(403)
    rows = await session.execute(
        select(SkillChangeRequest, User)
        .join(User, SkillChangeRequest.user_id == User.id)
        .where(
            SkillChangeRequest.company_id == current_user.company_id,
            SkillChangeRequest.status == "pending",
        )
        .order_by(SkillChangeRequest.created_at.desc())
    )
    pairs = rows.all()

    # Collect all skill_ids across all requests to resolve names in one query
    all_skill_ids: set[uuid.UUID] = set()
    for r, _ in pairs:
        for item in r.requested_skills:
            try:
                all_skill_ids.add(uuid.UUID(str(item.get("skill_id", ""))))
            except (ValueError, AttributeError):
                pass
    skill_name_map: dict[str, str] = {}
    if all_skill_ids:
        skill_rows = await session.execute(
            select(Skill.id, Skill.name).where(Skill.id.in_(all_skill_ids))
        )
        skill_name_map = {str(sid): sname for sid, sname in skill_rows.all()}

    def _enrich(skills: list[dict]) -> list[dict]:
        return [
            {**s, "skill_name": skill_name_map.get(str(s.get("skill_id")), str(s.get("skill_id", "")))}
            for s in skills
        ]

    return [
        SkillRequestPublic(
            id=r.id,
            user_id=r.user_id,
            user_name=u.full_name or u.email,
            requested_skills=_enrich(r.requested_skills),
            status=r.status,
            note=r.note,
            created_at=r.created_at,
        )
        for r, u in pairs
    ]


@router.get("/requests/my", response_model=list[SkillRequestPublic])
async def list_my_skill_requests(session: AsyncSessionDep, current_user: CurrentUser):
    """Nhân viên xem lịch sử yêu cầu của mình."""
    rows = await session.execute(
        select(SkillChangeRequest)
        .where(
            SkillChangeRequest.user_id == current_user.id,
            SkillChangeRequest.company_id == current_user.company_id,
        )
        .order_by(SkillChangeRequest.created_at.desc())
        .limit(20)
    )
    return [
        SkillRequestPublic(
            id=r.id,
            user_id=r.user_id,
            requested_skills=r.requested_skills,
            status=r.status,
            note=r.note,
            created_at=r.created_at,
        )
        for r in rows.scalars().all()
    ]


@router.post("/requests/{request_id}/approve", response_model=SkillRequestPublic)
async def approve_skill_request(
    request_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    if not await _is_director_or_manager(session, current_user):
        raise HTTPException(403)
    req = await _srs.approve_request(
        session,
        request_id=request_id,
        reviewer_id=current_user.id,
        company_id=current_user.company_id,
    )
    return SkillRequestPublic(
        id=req.id, user_id=req.user_id,
        requested_skills=req.requested_skills,
        status=req.status, note=req.note,
        created_at=req.created_at, reviewed_by=req.reviewed_by,
    )


@router.post("/requests/{request_id}/reject", response_model=SkillRequestPublic)
async def reject_skill_request(
    request_id: uuid.UUID,
    body: SkillRequestReview,
    session: AsyncSessionDep,
    current_user: CurrentUser,
):
    if not await _is_director_or_manager(session, current_user):
        raise HTTPException(403)
    req = await _srs.reject_request(
        session,
        request_id=request_id,
        reviewer_id=current_user.id,
        company_id=current_user.company_id,
        note=body.note,
    )
    return SkillRequestPublic(
        id=req.id, user_id=req.user_id,
        requested_skills=req.requested_skills,
        status=req.status, note=req.note,
        created_at=req.created_at, reviewed_by=req.reviewed_by,
    )
