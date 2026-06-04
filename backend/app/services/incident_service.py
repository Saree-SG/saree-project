"""Incident service — issue log CRUD + knowledge-base search."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.models.incident import (
    INCIDENT_CATEGORIES,
    INCIDENT_SEVERITIES,
    Incident,
    IncidentAttachment,
    IncidentCreate,
    IncidentResolve,
    IncidentUpdate,
)
from app.models.user import User


class IncidentService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _validate_enums(category: str | None, severity: str | None) -> None:
        if category is not None and category not in INCIDENT_CATEGORIES:
            raise HTTPException(422, f"Invalid category: {category}")
        if severity is not None and severity not in INCIDENT_SEVERITIES:
            raise HTTPException(422, f"Invalid severity: {severity}")

    async def _get_or_404(self, incident_id: uuid.UUID) -> Incident:
        result = await self._session.execute(
            select(Incident)
            .where(Incident.id == incident_id)
            .options(selectinload(Incident.attachments))  # type: ignore[arg-type]
        )
        incident = result.scalars().first()
        if not incident:
            raise HTTPException(404, "Incident not found")
        return incident

    async def create(self, body: IncidentCreate, user: User) -> Incident:
        if not user.company_id:
            raise HTTPException(400, "User has no company")
        self._validate_enums(body.category, body.severity)
        incident = Incident(
            company_id=user.company_id,
            project_id=body.project_id,
            task_id=body.task_id,
            title=body.title,
            description=body.description,
            category=body.category,
            severity=body.severity,
            root_cause=body.root_cause,
            solution=body.solution,
            reported_by=user.id,
        )
        self._session.add(incident)
        await self._session.flush()
        await self._session.refresh(incident, attribute_names=["attachments"])
        return incident

    async def list(
        self,
        user: User,
        *,
        category: str | None = None,
        status_filter: str | None = None,
        project_id: uuid.UUID | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Incident], int]:
        stmt = select(Incident).where(Incident.company_id == user.company_id)
        if category:
            stmt = stmt.where(Incident.category == category)
        if status_filter:
            stmt = stmt.where(Incident.status == status_filter)
        if project_id:
            stmt = stmt.where(Incident.project_id == project_id)
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Incident.title.ilike(like),  # type: ignore[union-attr]
                    Incident.description.ilike(like),  # type: ignore[union-attr]
                    Incident.solution.ilike(like),  # type: ignore[union-attr]
                    Incident.root_cause.ilike(like),  # type: ignore[union-attr]
                )
            )

        count_result = await self._session.execute(
            select(func.count()).select_from(stmt.subquery())
        )
        total = int(count_result.scalar_one())

        stmt = (
            stmt.options(selectinload(Incident.attachments))  # type: ignore[arg-type]
            .order_by(Incident.created_at.desc())  # type: ignore[union-attr]
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all()), total

    async def get(self, incident_id: uuid.UUID) -> Incident:
        return await self._get_or_404(incident_id)

    async def update(
        self, incident_id: uuid.UUID, body: IncidentUpdate
    ) -> Incident:
        incident = await self._get_or_404(incident_id)
        self._validate_enums(body.category, body.severity)
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(incident, key, value)
        incident.updated_at = datetime.now(timezone.utc)
        self._session.add(incident)
        await self._session.flush()
        return incident

    async def resolve(
        self, incident_id: uuid.UUID, body: IncidentResolve, user: User
    ) -> Incident:
        incident = await self._get_or_404(incident_id)
        incident.root_cause = body.root_cause
        incident.solution = body.solution
        incident.status = "resolved"
        incident.resolved_by = user.id
        incident.resolved_at = datetime.now(timezone.utc)
        incident.updated_at = incident.resolved_at
        self._session.add(incident)
        await self._session.flush()
        return incident

    async def add_attachment(
        self, incident_id: uuid.UUID, file_url: str, file_type: str = "image"
    ) -> IncidentAttachment:
        await self._get_or_404(incident_id)
        att = IncidentAttachment(
            incident_id=incident_id, file_url=file_url, file_type=file_type
        )
        self._session.add(att)
        await self._session.flush()
        return att
