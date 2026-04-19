"""
Project models: Project, TaskLevelConfig, DelayWarning.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, DateTime, Text
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
class ProjectBase(SQLModel):
    name: str = Field(max_length=255)
    code: str = Field(max_length=50, index=True)   # Short identifier, e.g. "PRJ-001"
    description: str | None = Field(default=None, sa_type=Text)
    start_date: date
    end_date: date
    status: str = Field(default="planning", max_length=30)
    # planning | active | on_hold | completed | cancelled


class Project(ProjectBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    department_id: uuid.UUID | None = Field(default=None, foreign_key="department.id", index=True)
    pm_id: uuid.UUID = Field(foreign_key="user.id", index=True)   # Project Manager
    created_by: uuid.UUID = Field(foreign_key="user.id")
    chat_room_id: uuid.UUID | None = Field(default=None, foreign_key="chatroom.id", index=True)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    is_deleted: bool = Field(default=False)
    deleted_at: datetime | None = None

    # Relationships
    company: "Company" = Relationship(back_populates="projects")  # type: ignore
    members: list["ProjectMemberRole"] = Relationship(back_populates="project")  # type: ignore
    tasks: list["Task"] = Relationship(back_populates="project")  # type: ignore
    level_configs: list["TaskLevelConfig"] = Relationship(back_populates="project", cascade_delete=True)


class ProjectCreate(ProjectBase):
    department_id: uuid.UUID | None = None


class ProjectUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    pm_id: uuid.UUID | None = None


class ProjectPublic(ProjectBase):
    id: uuid.UUID
    company_id: uuid.UUID
    department_id: uuid.UUID | None
    pm_id: uuid.UUID
    chat_room_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class ProjectsPublic(SQLModel):
    data: list[ProjectPublic]
    count: int


# ---------------------------------------------------------------------------
# TaskLevelConfig — defines the hierarchy per project
# ---------------------------------------------------------------------------
class TaskLevelConfig(SQLModel, table=True):
    """
    Each project defines its own task hierarchy.
    Level 0 = top-level (e.g. "Đầu việc chính" assigned by Director)
    Level 1 = 2nd tier (e.g. "Hạng mục" assigned by Manager)
    Level N = leaf (e.g. "Việc nhỏ" done by Worker, requires proof)

    Adding a new tier = INSERT a row. No code change.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    level: int                        # 0, 1, 2, ...
    label: str = Field(max_length=100)  # "Đầu việc", "Hạng mục", "Công việc", "Việc nhỏ"
    requires_proof: bool = False      # Worker must upload proof to mark Done
    can_have_children: bool = True    # If False → leaf node
    max_children: int | None = None   # None = unlimited
    assignable_role_ids: list[str] | None = Field(default=None, sa_type=JSON)

    project: Project = Relationship(back_populates="level_configs")


class TaskLevelConfigPublic(SQLModel):
    id: uuid.UUID
    project_id: uuid.UUID
    level: int
    label: str
    requires_proof: bool
    can_have_children: bool
    max_children: int | None


class TaskLevelConfigCreate(SQLModel):
    level: int
    label: str
    requires_proof: bool = False
    can_have_children: bool = True
    max_children: int | None = None
    assignable_role_ids: list[uuid.UUID] | None = None


# ---------------------------------------------------------------------------
# Delay warnings (non-table, computed on-demand)
# ---------------------------------------------------------------------------

class DelayWarningPublic(SQLModel):
    severity: str               # "red" | "orange" | "yellow"
    layer: int                  # 1..4
    title: str
    detail: str
    task_id: str | None = None
    task_name: str | None = None
    estimated_delay_days: int | None = None


class DelayWarningsPublic(SQLModel):
    warnings: list[DelayWarningPublic]
    analyzed_at: datetime
