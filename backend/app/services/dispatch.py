"""Engine Điều phối — gợi ý nhân sự cho task thiếu người.

Thuật toán xếp hạng (điểm cao = phù hợp hơn):
  40pt  kỹ năng khớp × cấp độ (max 5 → 40pt)
  30pt  workload thấp (free=30, stable=15, overloaded=0)
  20pt  khoảng cách gần (0km=20, ≥100km=0, tuyến tính)
  10pt  đang rảnh trong khoảng thời gian task
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.project import Project
from app.models.skill import Skill, UserSkill
from app.models.task import Task, TaskAssignee
from app.models.user import User
from app.services.travel import haversine_km


@dataclass
class Candidate:
    user_id: uuid.UUID
    user_name: str
    skill_name: str
    skill_level: int          # 1–5
    workload_pct: float       # 0–100+
    load_status: str          # free | stable | overloaded
    current_task_name: str | None
    current_site_name: str | None
    distance_km: float | None  # khoảng cách tới project site
    eta_minutes: int | None
    score: float              # tổng điểm
    impact: str               # "Ít ảnh hưởng" | "Ảnh hưởng vừa" | "Ảnh hưởng lớn"


async def suggest_assignees(
    *,
    session: AsyncSession,
    task_id: uuid.UUID,
    company_id: uuid.UUID,
    limit: int = 10,
) -> list[Candidate]:
    """Trả danh sách ứng viên gợi ý cho task, xếp theo điểm giảm dần."""

    # 1. Lấy thông tin task + project (cần tọa độ site)
    task = await session.get(Task, task_id)
    if not task:
        return []

    project = await session.get(Project, task.project_id) if task.project_id else None

    # 2. Yêu cầu kỹ năng từ task_profiles (task.required_skill_ids nếu có)
    #    Fallback: lấy tất cả skill của công ty
    required_skill_ids: list[uuid.UUID] = []
    if hasattr(task, "required_skill_ids") and task.required_skill_ids:  # type: ignore[union-attr]
        required_skill_ids = task.required_skill_ids  # type: ignore[assignment]

    # 3. Lấy assignees hiện tại để loại khỏi danh sách
    assigned_q = await session.execute(
        select(TaskAssignee.user_id).where(TaskAssignee.task_id == task_id)
    )
    already_assigned = {row[0] for row in assigned_q.all()}

    # 4. Lấy tất cả members của công ty + kỹ năng
    user_q = await session.execute(
        select(User).where(User.company_id == company_id, User.is_active == True)  # noqa: E712
    )
    all_users = {u.id: u for u in user_q.scalars().all()}

    # UserSkill join Skill
    skill_q = await session.execute(
        select(UserSkill, Skill)
        .join(Skill, UserSkill.skill_id == Skill.id)
        .where(UserSkill.company_id == company_id)
    )
    # user_id → list of (UserSkill, Skill)
    user_skills: dict[uuid.UUID, list[tuple]] = {}
    for us, sk in skill_q.all():
        user_skills.setdefault(us.user_id, []).append((us, sk))

    # 5. Workload hiện tại: count in_progress tasks per user
    wl_q = await session.execute(
        select(TaskAssignee.user_id, func.count(Task.id).label("cnt"))
        .join(Task, TaskAssignee.task_id == Task.id)
        .where(
            Task.company_id == company_id,
            Task.status == "in_progress",
            Task.is_deleted == False,  # noqa: E712
        )
        .group_by(TaskAssignee.user_id)
    )
    active_tasks: dict[uuid.UUID, int] = {row.user_id: row.cnt for row in wl_q.all()}

    # 6. Công việc đang làm của từng user (tên task + project)
    current_task_q = await session.execute(
        select(TaskAssignee.user_id, Task.id, Task.name, Task.project_id)
        .join(Task, TaskAssignee.task_id == Task.id)
        .where(
            Task.company_id == company_id,
            Task.status == "in_progress",
            Task.is_deleted == False,  # noqa: E712
        )
    )
    user_current_task: dict[uuid.UUID, tuple] = {}
    for uid, tid, tname, tpid in current_task_q.all():
        if uid not in user_current_task:
            user_current_task[uid] = (tname, tpid)

    # Project name map
    if user_current_task:
        proj_ids = list({v[1] for v in user_current_task.values() if v[1]})
        proj_q = await session.execute(
            select(Project.id, Project.name, Project.site_lat, Project.site_lng)
            .where(Project.id.in_(proj_ids))
        )
        proj_map = {row.id: row for row in proj_q.all()}
    else:
        proj_map = {}

    # 7. Tính điểm và build candidates
    candidates: list[Candidate] = []
    dest_lat = project.site_lat if project else None
    dest_lng = project.site_lng if project else None

    for user_id, user in all_users.items():
        if user_id in already_assigned:
            continue

        skills = user_skills.get(user_id, [])

        # Kỹ năng khớp: tìm skill liên quan
        best_skill_name = "—"
        best_skill_level = 0
        skill_score = 0.0

        if required_skill_ids:
            matching = [s for s in skills if s[0].skill_id in required_skill_ids]
        else:
            matching = skills  # không yêu cầu cụ thể → tất cả đều tính

        if matching:
            best = max(matching, key=lambda s: s[0].level)
            best_skill_level = best[0].level
            best_skill_name = best[1].name
            skill_score = (best_skill_level / 5) * 40
        elif not required_skill_ids:
            skill_score = 10  # có người là được nếu không yêu cầu kỹ năng cụ thể

        # Workload
        n_active = active_tasks.get(user_id, 0)
        if n_active == 0:
            load_status = "free"
            workload_pct = 0.0
            wl_score = 30.0
        elif n_active <= 2:
            load_status = "stable"
            workload_pct = n_active * 40.0
            wl_score = 15.0
        else:
            load_status = "overloaded"
            workload_pct = n_active * 40.0
            wl_score = 0.0

        # Khoảng cách
        dist_km: float | None = None
        eta_min: int | None = None
        dist_score = 10.0  # mặc định nếu không có tọa độ

        current_info = user_current_task.get(user_id)
        src_lat = src_lng = None
        current_task_name = None
        current_site_name = None

        if current_info:
            current_task_name = current_info[0]
            if current_info[1] and current_info[1] in proj_map:
                proj_row = proj_map[current_info[1]]
                current_site_name = proj_row.name
                src_lat = proj_row.site_lat
                src_lng = proj_row.site_lng

        if src_lat and src_lng and dest_lat and dest_lng:
            dist_km = haversine_km(src_lat, src_lng, dest_lat, dest_lng)
            speed_kmh = 35.0
            road_factor = 1.4
            eta_min = math.ceil(dist_km * road_factor / speed_kmh * 60)
            dist_score = max(0.0, 20.0 * (1 - dist_km / 100))
        elif dest_lat and not src_lat:
            dist_score = 20.0  # đang rảnh → không bị trừ điểm khoảng cách

        total_score = skill_score + wl_score + dist_score

        # Impact
        if load_status == "free":
            impact = "Ít ảnh hưởng"
        elif load_status == "stable" and (dist_km is None or dist_km < 30):
            impact = "Ảnh hưởng vừa"
        else:
            impact = "Ảnh hưởng lớn"

        candidates.append(Candidate(
            user_id=user_id,
            user_name=user.full_name or user.email,
            skill_name=best_skill_name,
            skill_level=best_skill_level,
            workload_pct=workload_pct,
            load_status=load_status,
            current_task_name=current_task_name,
            current_site_name=current_site_name,
            distance_km=round(dist_km, 1) if dist_km is not None else None,
            eta_minutes=eta_min,
            score=round(total_score, 1),
            impact=impact,
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates[:limit]
