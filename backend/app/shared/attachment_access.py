"""Single choke point for "may this user touch this attachment" checks.

Every attachment-serving or attachment-editing route (download, signed-url,
office editor-config, office callback) MUST go through resolve_attachment()
below rather than re-deriving company_id / permission logic itself. This is
what keeps a per-tenant leak from creeping back in one route at a time.

Supported attachment_type values match ATTACHMENT_TABLES in the
0053_office_foundation migration: "quotation", "contract", "incident", "chat".
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatAttachment, ChatMember, ChatMessage, ChatRoom
from app.models.contract import Contract, ContractAttachment
from app.models.incident import Incident, IncidentAttachment
from app.models.quotation import Quotation, QuotationAttachment
from app.models.user import User
from app.shared.permission import has_permission

# Not found (never 403) on any authorization failure below — do not reveal
# to a caller in another tenant whether the id even exists.
_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@dataclass(frozen=True, slots=True)
class ResolvedAttachment:
    """An attachment record plus the tenant/company it belongs to."""

    attachment_type: str
    attachment_id: uuid.UUID
    company_id: uuid.UUID
    storage_key: str | None
    file_name: str
    # SQLModel row, kept for callers that need extra fields (e.g. document status)
    row: object


# view_permission_codes / edit_permission_code let callers ask either
# "can view" (any-of) or "can edit" (single code) without hard-coding per
# module logic outside this file.
_MODULE_CONFIG: dict[str, dict[str, object]] = {
    "quotation": {
        "view": ("QUOTATION_VIEW", "QUOTATION_VIEW_ALL"),
        "edit": "QUOTATION_UPDATE",
    },
    "contract": {
        "view": ("CONTRACT_VIEW", "CONTRACT_VIEW_ALL"),
        "edit": "CONTRACT_UPDATE",
    },
    "incident": {
        "view": ("INCIDENT_VIEW",),
        "edit": "INCIDENT_UPDATE",
    },
    "chat": {
        # Chat has no dedicated view/update permission — room membership is
        # the gate, checked in resolve_attachment() below. These entries are
        # never consulted for chat.
        "view": (),
        "edit": None,
    },
}


async def _load(
    session: AsyncSession, attachment_type: str, attachment_id: uuid.UUID
) -> tuple[object, uuid.UUID, uuid.UUID | None]:
    """Fetch the attachment row, its owning company_id, and (for chat) room_id.

    Raises 404 if the attachment or any parent in the chain is missing.
    """

    if attachment_type == "quotation":
        att = await session.get(QuotationAttachment, attachment_id)
        if att is None:
            raise _NOT_FOUND
        parent = await session.get(Quotation, att.quotation_id)
        if parent is None:
            raise _NOT_FOUND
        return att, parent.company_id, None

    if attachment_type == "contract":
        att = await session.get(ContractAttachment, attachment_id)
        if att is None:
            raise _NOT_FOUND
        parent = await session.get(Contract, att.contract_id)
        if parent is None:
            raise _NOT_FOUND
        return att, parent.company_id, None

    if attachment_type == "incident":
        att = await session.get(IncidentAttachment, attachment_id)
        if att is None:
            raise _NOT_FOUND
        parent = await session.get(Incident, att.incident_id)
        if parent is None:
            raise _NOT_FOUND
        return att, parent.company_id, None

    if attachment_type == "chat":
        att = await session.get(ChatAttachment, attachment_id)
        if att is None:
            raise _NOT_FOUND
        message = await session.get(ChatMessage, att.message_id)
        if message is None:
            raise _NOT_FOUND
        room = await session.get(ChatRoom, message.room_id)
        if room is None:
            raise _NOT_FOUND
        return att, room.company_id, room.id

    raise _NOT_FOUND


async def _is_chat_room_member(session: AsyncSession, user: User, room_id: uuid.UUID) -> bool:
    result = await session.execute(
        select(ChatMember).where(ChatMember.room_id == room_id, ChatMember.user_id == user.id)
    )
    return result.first() is not None


def _attachment_display_name(attachment_type: str, att: object) -> str:
    if attachment_type == "chat":
        return getattr(att, "filename", "file")
    return getattr(att, "file_name", "file")


async def resolve_attachment(
    session: AsyncSession,
    user: User,
    attachment_type: str,
    attachment_id: uuid.UUID,
    *,
    require: str = "view",
) -> ResolvedAttachment:
    """Load an attachment and enforce tenant + permission, or raise 404/403.

    require="view"  -> user must be able to view the parent module (or, for
                        chat, be a member of the room).
    require="edit"  -> user must additionally hold the module's *_UPDATE
                        permission (used to gate online Office editing).

    Always raises 404 (never 403) so an id from another tenant does not leak
    its existence.
    """
    if attachment_type not in _MODULE_CONFIG:
        raise _NOT_FOUND

    att, company_id, room_id = await _load(session, attachment_type, attachment_id)

    if not user.is_superuser and user.company_id != company_id:
        raise _NOT_FOUND

    if attachment_type == "chat":
        # Room membership is the access gate for chat; view+edit are the same
        # bar (anyone in the room can both read and, if editing is enabled,
        # write back an edited copy of their own shared file).
        if not user.is_superuser and not await _is_chat_room_member(session, user, room_id):
            raise _NOT_FOUND
    else:
        config = _MODULE_CONFIG[attachment_type]
        codes = config["view"] if require == "view" else (config["edit"],)
        allowed = False
        for code in codes:
            if code and await has_permission(session, user, code, target_company_id=company_id):
                allowed = True
                break
        if not allowed:
            raise _NOT_FOUND

    return ResolvedAttachment(
        attachment_type=attachment_type,
        attachment_id=attachment_id,
        company_id=company_id,
        storage_key=getattr(att, "storage_key", None),
        file_name=_attachment_display_name(attachment_type, att),
        row=att,
    )
