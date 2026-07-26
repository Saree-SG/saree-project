"""Model yêu cầu thay đổi kỹ năng — nhân viên đề xuất, quản lý/giám đốc duyệt."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Column, Field, SQLModel
from sqlalchemy import JSON

SKILL_REQUEST_STATUSES = ("pending", "approved", "rejected", "cancelled")


class SkillChangeRequest(SQLModel, table=True):
    __tablename__ = "skill_change_request"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)  # người được cập nhật kỹ năng
    requested_by: uuid.UUID = Field(foreign_key="user.id")          # người gửi yêu cầu (thường = user_id)
    reviewed_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")

    # Danh sách kỹ năng đề xuất: [{"skill_id": "...", "level": 3}, ...]
    requested_skills: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))

    status: str = Field(default="pending", max_length=20, index=True)
    note: str | None = Field(default=None, max_length=500)  # ghi chú khi từ chối

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Schema công khai ──────────────────────────────────────────────────────────

class SkillRequestPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    requested_skills: list[dict[str, Any]]
    status: str
    note: str | None = None
    created_at: datetime
    reviewed_by: uuid.UUID | None = None


class SkillRequestSubmit(SQLModel):
    """Body khi nhân viên gửi yêu cầu."""
    requested_skills: list[dict[str, Any]]  # [{"skill_id": "...", "level": 3}]


class SkillRequestReview(SQLModel):
    """Body khi duyệt hoặc từ chối."""
    note: str | None = None
