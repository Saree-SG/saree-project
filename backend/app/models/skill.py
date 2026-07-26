"""Skill catalogue + UserSkill junction."""
from __future__ import annotations

import uuid

from sqlmodel import Field, SQLModel


class Skill(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    name: str = Field(max_length=100)
    category: str = Field(default="general", max_length=50)  # e.g. "lạnh", "điện", "hàn"
    description: str | None = Field(default=None, max_length=500)


class UserSkill(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    skill_id: uuid.UUID = Field(foreign_key="skill.id", index=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    level: int = Field(default=1)  # 1–5


# ── Public schemas ────────────────────────────────────────────────────────────

class SkillPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    category: str
    description: str | None


class SkillCreate(SQLModel):
    name: str
    category: str = "general"
    description: str | None = None


class SkillUpdate(SQLModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None


class UserSkillPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    skill_id: uuid.UUID
    skill_name: str
    skill_category: str
    level: int


class UserSkillUpsert(SQLModel):
    skill_id: uuid.UUID
    level: int = Field(default=1, ge=1, le=5)
