"""Admin statistics endpoints — overview, sessions, login frequency."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.api.deps import AsyncSessionDep, get_current_active_superuser
from app.core.auth.session_service import get_session_service
from app.models.org import Company, Department, Role
from app.models.task import AuditLog
from app.models.user import LoginHistory, User

router = APIRouter(
    prefix="/admin/stats",
    tags=["admin-stats"],
    dependencies=[Depends(get_current_active_superuser)],
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/overview")
async def get_overview(session: AsyncSessionDep) -> dict[str, Any]:
    """High-level KPI counters for the admin overview screen."""
    now = _utcnow()
    cutoff_30d = now - timedelta(days=30)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    total_users = (await session.execute(select(func.count(User.id)))).scalar_one()
    active_users = (
        await session.execute(select(func.count(User.id)).where(User.is_active == True))  # noqa: E712
    ).scalar_one()
    total_companies = (await session.execute(select(func.count(Company.id)))).scalar_one()
    total_departments = (await session.execute(select(func.count(Department.id)))).scalar_one()
    total_roles = (await session.execute(select(func.count(Role.id)))).scalar_one()

    logins_today = (
        await session.execute(
            select(func.count(LoginHistory.id)).where(
                LoginHistory.login_at >= today_start,
                LoginHistory.success == True,  # noqa: E712
            )
        )
    ).scalar_one()

    active_users_30d = (
        await session.execute(
            select(func.count(func.distinct(LoginHistory.user_id))).where(
                LoginHistory.login_at >= cutoff_30d,
                LoginHistory.success == True,  # noqa: E712
                LoginHistory.user_id.is_not(None),
            )
        )
    ).scalar_one()

    online_now = len(get_session_service().list_active_sessions())

    return {
        "total_users": int(total_users or 0),
        "active_users": int(active_users or 0),
        "active_users_30d": int(active_users_30d or 0),
        "total_companies": int(total_companies or 0),
        "total_departments": int(total_departments or 0),
        "total_roles": int(total_roles or 0),
        "logins_today": int(logins_today or 0),
        "online_now": int(online_now),
    }


@router.get("/sessions/active")
async def list_active_sessions(session: AsyncSessionDep) -> list[dict[str, Any]]:
    """List currently active sessions with enriched user info."""
    sessions = get_session_service().list_active_sessions()
    if not sessions:
        return []

    user_ids = {s["user_id"] for s in sessions if s.get("user_id")}
    rows = (
        await session.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all() if user_ids else []
    users_by_id = {str(u.id): u for u in rows}

    enriched: list[dict[str, Any]] = []
    for s in sessions:
        uid = s.get("user_id")
        user = users_by_id.get(str(uid)) if uid else None
        enriched.append(
            {
                "session_id": s["session_id"],
                "user_id": uid,
                "email": user.email if user else None,
                "full_name": user.full_name if user else None,
                "login_at": (
                    datetime.fromtimestamp(s["login_at"], tz=timezone.utc).isoformat()
                    if s.get("login_at")
                    else None
                ),
                "last_seen_at": (
                    datetime.fromtimestamp(s["last_seen_at"], tz=timezone.utc).isoformat()
                    if s.get("last_seen_at")
                    else None
                ),
                "ip_address": s.get("ip_address"),
                "user_agent": s.get("user_agent"),
            }
        )
    enriched.sort(key=lambda x: x.get("last_seen_at") or "", reverse=True)
    return enriched


@router.get("/logins")
async def get_login_frequency(
    session: AsyncSessionDep,
    days: int = Query(default=30, ge=1, le=180),
) -> list[dict[str, Any]]:
    """Login frequency per day for the last N days (success-only)."""
    cutoff = _utcnow() - timedelta(days=days)
    date_col = func.date(LoginHistory.login_at).label("date")
    result = await session.execute(
        select(
            date_col,
            func.count(LoginHistory.id).label("login_count"),
            func.count(func.distinct(LoginHistory.user_id)).label("unique_users"),
        )
        .where(
            LoginHistory.login_at >= cutoff,
            LoginHistory.success == True,  # noqa: E712
        )
        .group_by(date_col)
        .order_by(date_col)
    )
    return [
        {
            "date": str(row.date),
            "login_count": int(row.login_count),
            "unique_users": int(row.unique_users),
        }
        for row in result.all()
    ]


@router.get("/users/activity")
async def get_users_activity(
    session: AsyncSessionDep,
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[dict[str, Any]]:
    """Top users by login count over the last N days."""
    cutoff = _utcnow() - timedelta(days=days)
    result = await session.execute(
        select(
            User.id,
            User.full_name,
            User.email,
            func.count(LoginHistory.id).label("login_count"),
            func.max(LoginHistory.login_at).label("last_login"),
        )
        .join(LoginHistory, LoginHistory.user_id == User.id)
        .where(
            LoginHistory.login_at >= cutoff,
            LoginHistory.success == True,  # noqa: E712
        )
        .group_by(User.id, User.full_name, User.email)
        .order_by(func.count(LoginHistory.id).desc())
        .limit(limit)
    )
    return [
        {
            "user_id": str(row.id),
            "full_name": row.full_name,
            "email": row.email,
            "login_count": int(row.login_count),
            "last_login": row.last_login.isoformat() if row.last_login else None,
        }
        for row in result.all()
    ]


@router.get("/audit")
async def list_audit_log(
    session: AsyncSessionDep,
    limit: int = Query(default=100, ge=1, le=500),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    actor_id: uuid.UUID | None = Query(default=None),
) -> list[dict[str, Any]]:
    """Return recent audit log entries (system-wide) with actor info."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    rows = (await session.execute(stmt)).scalars().all()

    actor_ids = {r.actor_id for r in rows}
    actors = (
        await session.execute(select(User).where(User.id.in_(actor_ids)))
    ).scalars().all() if actor_ids else []
    actors_by_id = {a.id: a for a in actors}

    return [
        {
            "id": str(r.id),
            "actor_id": str(r.actor_id),
            "actor_name": (
                actors_by_id[r.actor_id].full_name
                or actors_by_id[r.actor_id].email
                if r.actor_id in actors_by_id
                else None
            ),
            "actor_email": (
                actors_by_id[r.actor_id].email if r.actor_id in actors_by_id else None
            ),
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": str(r.entity_id),
            "old_value": r.old_value,
            "new_value": r.new_value,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: str) -> None:
    """Force-revoke an active session by id."""
    ok = get_session_service().revoke_session_by_id(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return None
