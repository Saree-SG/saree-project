"""Contract domain repository."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.repository import BaseRepository
from app.models.contract import Contract, ContractAttachment, ContractStatusTransition


class ContractRepository(BaseRepository[Contract]):

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Contract, session)

    # ------------------------------------------------------------------
    # Contract number generation
    # ------------------------------------------------------------------

    async def next_contract_number(self, year: int) -> str:
        prefix = f"HD-{year}-"
        stmt = (
            select(func.count())
            .select_from(Contract)
            .where(Contract.contract_number.like(f"{prefix}%"))  # type: ignore[attr-defined]
        )
        result = await self._execute(stmt)
        seq = (result.scalar_one() or 0) + 1
        return f"{prefix}{seq:03d}"

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------

    async def get_or_404(self, contract_id: uuid.UUID) -> Contract:
        c = await self.get_by_id(contract_id)
        if not c or c.is_deleted:
            raise HTTPException(status_code=404, detail="Contract not found")
        return c

    async def get_by_quotation_id(self, quotation_id: uuid.UUID) -> Contract | None:
        result = await self._execute(
            select(Contract).where(
                Contract.quotation_id == quotation_id,
                Contract.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalars().first()

    async def list_with_filters(
        self,
        company_id: uuid.UUID,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[Contract], int]:
        base = select(Contract).where(
            Contract.company_id == company_id,
            Contract.is_deleted == False,  # noqa: E712
        )
        if status:
            base = base.where(Contract.status == status)

        count_result = await self._execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()

        result = await self._execute(
            base.order_by(Contract.created_at.desc()).offset(skip).limit(limit)  # type: ignore[attr-defined]
        )
        return result.scalars().all(), total

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def get_attachments(self, contract_id: uuid.UUID) -> Sequence[ContractAttachment]:
        result = await self._execute(
            select(ContractAttachment)
            .where(ContractAttachment.contract_id == contract_id)
            .order_by(ContractAttachment.uploaded_at)
        )
        return result.scalars().all()

    async def add_attachment(self, data: dict) -> ContractAttachment:
        att = ContractAttachment.model_validate(data)
        self._session.add(att)
        await self._session.flush()
        await self._session.refresh(att)
        return att

    async def get_attachment_or_404(
        self, contract_id: uuid.UUID, att_id: uuid.UUID
    ) -> ContractAttachment:
        result = await self._execute(
            select(ContractAttachment).where(
                ContractAttachment.id == att_id,
                ContractAttachment.contract_id == contract_id,
            )
        )
        att = result.scalars().first()
        if not att:
            raise HTTPException(status_code=404, detail="Attachment not found")
        return att

    async def delete_attachment(self, att: ContractAttachment) -> None:
        await self._session.delete(att)

    # ------------------------------------------------------------------
    # Transitions
    # ------------------------------------------------------------------

    async def get_transitions(self, contract_id: uuid.UUID) -> Sequence[ContractStatusTransition]:
        result = await self._execute(
            select(ContractStatusTransition)
            .where(ContractStatusTransition.contract_id == contract_id)
            .order_by(ContractStatusTransition.created_at)
        )
        return result.scalars().all()

    async def add_transition(self, data: dict) -> ContractStatusTransition:
        t = ContractStatusTransition.model_validate(data)
        self._session.add(t)
        await self._session.flush()
        await self._session.refresh(t)
        return t
