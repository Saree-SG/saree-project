"""Material Request repository."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.material_request import MaterialRequest, MaterialRequestAttachment


class MaterialRequestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, obj: MaterialRequest) -> MaterialRequest:
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def get(self, request_id: uuid.UUID) -> Optional[MaterialRequest]:
        return await self._session.get(MaterialRequest, request_id)

    async def list_for_company(
        self,
        company_id: uuid.UUID,
        *,
        status: Optional[str] = None,
        requester_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[MaterialRequest]:
        stmt = select(MaterialRequest).where(MaterialRequest.company_id == company_id)
        if status:
            stmt = stmt.where(MaterialRequest.status == status)
        if requester_id:
            stmt = stmt.where(MaterialRequest.requester_id == requester_id)
        stmt = stmt.order_by(MaterialRequest.created_at.desc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_pending_for_review(self, company_id: uuid.UUID) -> list[MaterialRequest]:
        result = await self._session.execute(
            select(MaterialRequest)
            .where(
                MaterialRequest.company_id == company_id,
                MaterialRequest.status == "pending_materials",
            )
            .order_by(MaterialRequest.created_at)
        )
        return list(result.scalars().all())

    async def list_pending_for_approval(self, company_id: uuid.UUID) -> list[MaterialRequest]:
        result = await self._session.execute(
            select(MaterialRequest)
            .where(
                MaterialRequest.company_id == company_id,
                MaterialRequest.status == "pending_director",
            )
            .order_by(MaterialRequest.created_at)
        )
        return list(result.scalars().all())

    async def list_by_requester(self, requester_id: uuid.UUID, skip: int = 0, limit: int = 50) -> list[MaterialRequest]:
        result = await self._session.execute(
            select(MaterialRequest)
            .where(MaterialRequest.requester_id == requester_id)
            .order_by(MaterialRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def add_attachment(self, att: MaterialRequestAttachment) -> MaterialRequestAttachment:
        self._session.add(att)
        await self._session.flush()
        await self._session.refresh(att)
        return att

    async def get_attachment(self, att_id: uuid.UUID) -> Optional[MaterialRequestAttachment]:
        return await self._session.get(MaterialRequestAttachment, att_id)

    async def delete_attachment(self, att: MaterialRequestAttachment) -> None:
        await self._session.delete(att)
        await self._session.flush()

    async def save(self, obj: MaterialRequest) -> MaterialRequest:
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj
