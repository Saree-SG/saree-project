"""
Incident model — construction/installation issue log + knowledge base.

Workers and leaders record issues encountered during manufacturing or on-site
installation, together with the root cause and the solution applied. Resolved
incidents become a searchable knowledge base so the same problem can be
diagnosed faster next time.
"""

import uuid
from datetime import datetime, timezone

from typing import List, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel

# Allowed values (validated at API layer, kept as plain str columns for flexibility)
INCIDENT_CATEGORIES = (
    "electrical",   # điện
    "welding",      # hàn
    "conveyor",     # băng chuyền
    "cooling",      # lạnh
    "insulation",   # bọc cách nhiệt
    "panel",        # kho lạnh / panel
    "other",
)
INCIDENT_SEVERITIES = ("low", "medium", "high")
INCIDENT_STATUSES = ("open", "resolved")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class IncidentAttachment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    incident_id: uuid.UUID = Field(foreign_key="incident.id", index=True)
    file_url: str = Field(max_length=1000)
    file_type: str = Field(default="image", max_length=20)
    uploaded_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    incident: Optional["Incident"] = Relationship(back_populates="attachments")


class Incident(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="project.id", index=True)
    task_id: uuid.UUID | None = Field(default=None, foreign_key="task.id", index=True)

    title: str = Field(max_length=500)
    description: str = Field(sa_type=Text)
    category: str = Field(default="other", max_length=30, index=True)
    severity: str = Field(default="medium", max_length=20)

    root_cause: str | None = Field(default=None, sa_type=Text)   # nguyên nhân
    solution: str | None = Field(default=None, sa_type=Text)      # giải pháp

    status: str = Field(default="open", max_length=20, index=True)

    reported_by: uuid.UUID = Field(foreign_key="user.id", index=True)
    resolved_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    resolved_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))  # type: ignore

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    attachments: List[IncidentAttachment] = Relationship(
        back_populates="incident",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class IncidentAttachmentPublic(SQLModel):
    id: uuid.UUID
    file_url: str
    file_type: str
    uploaded_at: datetime


class IncidentCreate(SQLModel):
    title: str = Field(max_length=500)
    description: str
    category: str = "other"
    severity: str = "medium"
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    root_cause: str | None = None
    solution: str | None = None


class IncidentResolve(SQLModel):
    root_cause: str
    solution: str


class IncidentUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    severity: str | None = None
    root_cause: str | None = None
    solution: str | None = None


class IncidentPublic(SQLModel):
    id: uuid.UUID
    company_id: uuid.UUID
    project_id: uuid.UUID | None
    task_id: uuid.UUID | None
    title: str
    description: str
    category: str
    severity: str
    root_cause: str | None
    solution: str | None
    status: str
    reported_by: uuid.UUID
    resolved_by: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    attachments: list[IncidentAttachmentPublic] = []


class IncidentsPublic(SQLModel):
    data: list[IncidentPublic]
    count: int
