"""Material Request service — create, list, review (step 1), decide (step 2), attachments."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.material_request import (
    MaterialRequest,
    MaterialRequestAttachment,
    MaterialRequestCreate,
    MaterialRequestDecision,
    MaterialRequestPublic,
    MaterialRequestReview,
)
from app.models.notification import Notification
from app.models.org import Permission, RolePermission, UserCompanyRole
from app.models.user import User
from app.repositories.material_request_repository import MaterialRequestRepository
from app.shared.storage import LocalStorage

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MaterialRequestService:
    def __init__(self, session: AsyncSession, storage: LocalStorage) -> None:
        self._session = session
        self._repo = MaterialRequestRepository(session)
        self._storage = storage

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create(self, body: MaterialRequestCreate, current_user: User) -> MaterialRequestPublic:
        if not current_user.company_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "User has no company")

        req = MaterialRequest(
            company_id=current_user.company_id,
            requester_id=current_user.id,
            task_id=body.task_id,
            item_name=body.item_name,
            quantity=body.quantity,
            unit=body.unit,
            reason=body.reason,
            status="pending_materials",
        )
        req = await self._repo.create(req)

        await self._notify_by_permission(
            "MATERIAL_REQUEST_REVIEW",
            current_user.company_id,
            title="Yêu cầu vật tư mới cần duyệt",
            body=f"{current_user.full_name or current_user.email} yêu cầu: {body.item_name} x{body.quantity} {body.unit}",
            entity_id=req.id,
        )

        return await self._to_public(req)

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------

    async def list_requests(
        self,
        current_user: User,
        *,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[MaterialRequestPublic]:
        if not current_user.company_id:
            return []

        can_view_all = await self._has_permission(current_user, "MATERIAL_REQUEST_REVIEW") or \
                       await self._has_permission(current_user, "MATERIAL_REQUEST_APPROVE")

        if can_view_all:
            rows = await self._repo.list_for_company(
                current_user.company_id,
                status=status_filter,
                skip=skip,
                limit=limit,
            )
        else:
            rows = await self._repo.list_by_requester(current_user.id, skip=skip, limit=limit)

        return [await self._to_public(r) for r in rows]

    # ------------------------------------------------------------------
    # Get single
    # ------------------------------------------------------------------

    async def get_or_404(self, request_id: uuid.UUID, current_user: User) -> MaterialRequestPublic:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
        await self._assert_can_view(req, current_user)
        return await self._to_public(req)

    # ------------------------------------------------------------------
    # Attachments
    # ------------------------------------------------------------------

    async def add_attachment(
        self, request_id: uuid.UUID, file: UploadFile, current_user: User
    ) -> MaterialRequestPublic:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
        if req.requester_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your request")
        if req.status not in ("pending_materials", "pending_director"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot attach files to a closed request")

        stored = await self._storage.save_upload(file)
        att = MaterialRequestAttachment(
            request_id=req.id,
            filename=file.filename or "upload",
            file_url=stored.public_url,
            uploaded_by=current_user.id,
        )
        await self._repo.add_attachment(att)
        return await self._to_public(req)

    async def delete_attachment(
        self, request_id: uuid.UUID, att_id: uuid.UUID, current_user: User
    ) -> None:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
        att = await self._repo.get_attachment(att_id)
        if att is None or att.request_id != request_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
        if att.uploaded_by != current_user.id and not current_user.is_superuser:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your attachment")
        await self._repo.delete_attachment(att)

    # ------------------------------------------------------------------
    # Step 1 — phòng vật tư review
    # ------------------------------------------------------------------

    async def review(
        self, request_id: uuid.UUID, body: MaterialRequestReview, current_user: User
    ) -> MaterialRequestPublic:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
        if req.status != "pending_materials":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot review request in status '{req.status}'")

        req.materials_reviewer_id = current_user.id
        req.materials_reviewed_at = _now()
        req.materials_note = body.note
        req.updated_at = _now()

        if body.approved:
            req.status = "pending_director"
            await self._repo.save(req)
            # notify director(s)
            await self._notify_by_permission(
                "MATERIAL_REQUEST_APPROVE",
                req.company_id,
                title="Yêu cầu vật tư chờ phê duyệt",
                body=f"Yêu cầu: {req.item_name} x{req.quantity} {req.unit} — phòng vật tư đã duyệt bước 1",
                entity_id=req.id,
            )
        else:
            req.status = "rejected"
            await self._repo.save(req)
            # notify requester
            await self._notify_user(
                req.requester_id,
                title="Yêu cầu vật tư bị từ chối",
                body=f"Yêu cầu {req.item_name} bị phòng vật tư từ chối. Ghi chú: {body.note or '—'}",
                entity_id=req.id,
            )

        return await self._to_public(req)

    # ------------------------------------------------------------------
    # Step 2 — giám đốc decide
    # ------------------------------------------------------------------

    async def decide(
        self, request_id: uuid.UUID, body: MaterialRequestDecision, current_user: User
    ) -> MaterialRequestPublic:
        req = await self._repo.get(request_id)
        if req is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
        if req.status != "pending_director":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot decide request in status '{req.status}'")

        req.director_reviewer_id = current_user.id
        req.director_reviewed_at = _now()
        req.director_note = body.note
        req.updated_at = _now()
        req.status = "approved" if body.approved else "rejected"
        await self._repo.save(req)

        outcome = "được phê duyệt" if body.approved else "bị từ chối"
        await self._notify_user(
            req.requester_id,
            title=f"Yêu cầu vật tư {outcome}",
            body=f"Yêu cầu {req.item_name} {outcome} bởi giám đốc. Ghi chú: {body.note or '—'}",
            entity_id=req.id,
        )

        return await self._to_public(req)

    # ------------------------------------------------------------------
    # My dashboard helpers
    # ------------------------------------------------------------------

    async def get_dashboard_data(self, current_user: User) -> dict:
        if not current_user.company_id:
            return {"pending_material_reviews": [], "pending_material_approvals": [], "my_material_requests": []}

        pending_reviews: list[MaterialRequestPublic] = []
        pending_approvals: list[MaterialRequestPublic] = []

        if await self._has_permission(current_user, "MATERIAL_REQUEST_REVIEW"):
            rows = await self._repo.list_pending_for_review(current_user.company_id)
            pending_reviews = [await self._to_public(r) for r in rows]

        if await self._has_permission(current_user, "MATERIAL_REQUEST_APPROVE"):
            rows = await self._repo.list_pending_for_approval(current_user.company_id)
            pending_approvals = [await self._to_public(r) for r in rows]

        my_rows = await self._repo.list_by_requester(current_user.id, limit=20)
        my_requests = [await self._to_public(r) for r in my_rows]

        return {
            "pending_material_reviews": [r.model_dump() for r in pending_reviews],
            "pending_material_approvals": [r.model_dump() for r in pending_approvals],
            "my_material_requests": [r.model_dump() for r in my_requests],
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _to_public(self, req: MaterialRequest) -> MaterialRequestPublic:
        await self._session.refresh(req, attribute_names=["attachments"])
        return MaterialRequestPublic.model_validate(req)

    async def _assert_can_view(self, req: MaterialRequest, user: User) -> None:
        if user.is_superuser:
            return
        if req.requester_id == user.id:
            return
        if await self._has_permission(user, "MATERIAL_REQUEST_REVIEW") or \
           await self._has_permission(user, "MATERIAL_REQUEST_APPROVE"):
            return
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    async def _has_permission(self, user: User, code: str) -> bool:
        if user.is_superuser:
            return True
        if not user.company_id:
            return False
        result = await self._session.execute(
            select(UserCompanyRole.role_id)
            .where(
                UserCompanyRole.user_id == user.id,
                UserCompanyRole.company_id == user.company_id,
            )
        )
        role_ids = list(result.scalars().all())
        if not role_ids:
            return False
        perm_result = await self._session.execute(
            select(RolePermission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                RolePermission.role_id.in_(role_ids),
                Permission.code == code,
            )
        )
        return perm_result.first() is not None

    async def _notify_by_permission(
        self,
        permission_code: str,
        company_id: uuid.UUID,
        *,
        title: str,
        body: str | None,
        entity_id: uuid.UUID,
    ) -> None:
        """Notify all users in the company who have the given permission."""
        try:
            # Find role_ids that have this permission
            perm_result = await self._session.execute(
                select(RolePermission.role_id)
                .join(Permission, Permission.id == RolePermission.permission_id)
                .where(Permission.code == permission_code)
            )
            role_ids = list(perm_result.scalars().all())
            if not role_ids:
                return

            # Find users in company with those roles
            user_result = await self._session.execute(
                select(UserCompanyRole.user_id)
                .where(
                    UserCompanyRole.company_id == company_id,
                    UserCompanyRole.role_id.in_(role_ids),
                )
            )
            user_ids = list(set(user_result.scalars().all()))

            for uid in user_ids:
                notif = Notification(
                    user_id=uid,
                    type="material_request",
                    title=title,
                    body=body,
                    entity_type="material_request",
                    entity_id=entity_id,
                )
                self._session.add(notif)

            await self._session.flush()
        except Exception:
            logger.exception("Failed to notify by permission code=%s entity=%s", permission_code, entity_id)

    async def _notify_user(
        self,
        user_id: uuid.UUID,
        *,
        title: str,
        body: str | None,
        entity_id: uuid.UUID,
    ) -> None:
        try:
            notif = Notification(
                user_id=user_id,
                type="material_request",
                title=title,
                body=body,
                entity_type="material_request",
                entity_id=entity_id,
            )
            self._session.add(notif)
            await self._session.flush()
        except Exception:
            logger.exception("Failed to notify user_id=%s entity=%s", user_id, entity_id)
