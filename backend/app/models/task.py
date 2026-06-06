"""
Task domain models:
  Task, TaskDependency, TaskObserver, TaskComment, TaskProof, AuditLog
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import JSON, DateTime, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------
class TaskBase(SQLModel):
    name: str = Field(max_length=500)
    description: str | None = Field(default=None, sa_type=Text)
    priority: str = Field(default="medium", max_length=20)
    # low | medium | high | critical
    start_time: datetime
    end_time: datetime


class Task(TaskBase, table=True):
    """
    Core task entity. Supports n-level tree via parent_id.
    level is computed automatically: parent.level + 1 (0 = root / HeadTask).

    STATUS NOTES:
    - Workflow statuses stored in DB: todo | in_progress | review | done
    - Computed statuses (NOT stored, calculated on-read):
        overdue_local    = end_time < now AND parent.end_time >= now
        overdue_critical = end_time < now AND (on critical path OR parent also overdue)
        due_soon         = end_time within 24h, not done
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    parent_id: uuid.UUID | None = Field(default=None, foreign_key="task.id", index=True)
    level: int = Field(default=0)                 # 0=HeadTask, 1=Task, 2=SubTask, ...

    status: str = Field(default="todo", max_length=30)
    # todo | in_progress | review | done   (overdue computed on-read)

    assignor_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    assignee_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    actual_end_time: datetime | None = None       # Set when status → done

    # Critical path (cached — recalculated async after dep changes)
    is_on_critical_path: bool = False

    # Progress allocation: % of parent task this subtask covers (None = use 100)
    progress_weight: int | None = Field(default=None)

    # Module categorization and linked business entity
    # module_tag: engineering | planning | procurement | production | supply | installation
    module_tag: str | None = Field(default=None, max_length=50)
    # linked_entity_type: purchase_request | material_issue
    linked_entity_type: str | None = Field(default=None, max_length=50)
    linked_entity_id: uuid.UUID | None = Field(default=None)

    # Color label and performance coefficient
    color: str | None = Field(default=None, max_length=30)
    performance_coefficient: float | None = None

    # If True, the assignee must capture GPS location when submitting a progress
    # report (proof %). Set/edited by the task creator.
    requires_checkin: bool = Field(default=False)

    # Reference location for the required check-in. When set, a progress report's
    # GPS is compared against this point; "valid" if within checkin_radius_m
    # (plus the report's GPS accuracy). Edited by the task creator.
    checkin_lat: float | None = None
    checkin_lng: float | None = None
    checkin_radius_m: int = Field(default=150)

    # Soft delete
    is_deleted: bool = False
    deleted_at: datetime | None = None

    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    # Relationships
    project: "Project" = Relationship(back_populates="tasks")  # type: ignore
    assignee: "User" = Relationship(  # type: ignore
        back_populates="assigned_tasks",
        sa_relationship_kwargs={"foreign_keys": "[Task.assignee_id]"},
    )
    assignor: "User" = Relationship(  # type: ignore
        back_populates="created_tasks",
        sa_relationship_kwargs={"foreign_keys": "[Task.assignor_id]"},
    )
    observers: list["TaskObserver"] = Relationship(back_populates="task", cascade_delete=True)
    linked_entities: list["TaskLinkedEntity"] = Relationship(
        back_populates="task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    comments: list["TaskComment"] = Relationship(back_populates="task", cascade_delete=True)
    proofs: list["TaskProof"] = Relationship(back_populates="task", cascade_delete=True)
    progress_reports: list["TaskProgressReport"] = Relationship(
        back_populates="task",
        cascade_delete=True,
    )
    # Dependencies where this task BLOCKS others
    blocking: list["TaskDependency"] = Relationship(
        back_populates="blocking_task",
        sa_relationship_kwargs={"foreign_keys": "[TaskDependency.blocking_task_id]"},
    )
    # Dependencies where this task WAITS for others
    waiting_for: list["TaskDependency"] = Relationship(
        back_populates="dependent_task",
        sa_relationship_kwargs={"foreign_keys": "[TaskDependency.dependent_task_id]"},
    )


# ---------------------------------------------------------------------------
# TaskAssignee — additional assignees beyond the primary assignee_id
# ---------------------------------------------------------------------------
class TaskAssignee(SQLModel, table=True):
    """Extra assignees for a task (many-to-many).

    The primary assignee stays in Task.assignee_id for backward compat.
    This table stores additional co-workers assigned to the same task.
    """
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    assigned_by: uuid.UUID = Field(foreign_key="user.id")
    assigned_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class TaskAssigneePublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    assigned_by: uuid.UUID
    assigned_at: datetime


# ---------------------------------------------------------------------------
# Request / Response schemas for Task
# ---------------------------------------------------------------------------
class TaskCreate(TaskBase):
    project_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    assignee_id: uuid.UUID
    extra_assignee_ids: list[uuid.UUID] = []  # co-workers added at creation time
    priority: str = "medium"
    progress_weight: int | None = None   # % of parent task this subtask covers
    module_tag: str | None = None
    linked_entity_type: str | None = None
    linked_entity_id: uuid.UUID | None = None
    requires_checkin: bool = False
    checkin_lat: float | None = None
    checkin_lng: float | None = None
    checkin_radius_m: int | None = None


class TaskUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    priority: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    assignee_id: uuid.UUID | None = None
    module_tag: str | None = None
    linked_entity_type: str | None = None
    linked_entity_id: uuid.UUID | None = None
    color: str | None = None
    performance_coefficient: float | None = None
    progress_weight: int | None = None
    requires_checkin: bool | None = None
    checkin_lat: float | None = None
    checkin_lng: float | None = None
    checkin_radius_m: int | None = None


class TaskStatusUpdate(SQLModel):
    status: str   # todo | in_progress | review | done
    note: str | None = None  # Required when status → done (proof description)


class BlockerInfo(SQLModel):
    """Minimal info about a task that is blocking this one."""
    id: uuid.UUID
    name: str
    status: str


class TaskPublic(TaskBase):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    level: int
    status: str
    computed_status: str | None = None   # overdue_local | overdue_critical | due_soon (server-computed)
    assignor_id: uuid.UUID
    assignee_id: uuid.UUID
    assignee_name: str | None = None
    assignor_name: str | None = None
    assignee_department_id: uuid.UUID | None = None
    assignee_department_name: str | None = None
    actual_end_time: datetime | None
    is_on_critical_path: bool
    created_at: datetime
    updated_at: datetime
    reported_progress_total: int = 0
    progress_weight: int | None = None   # % of parent this subtask covers
    requires_checkin: bool = False
    checkin_lat: float | None = None
    checkin_lng: float | None = None
    checkin_radius_m: int = 150
    module_tag: str | None = None
    linked_entity_type: str | None = None
    linked_entity_id: uuid.UUID | None = None
    linked_entities: list["TaskLinkedEntityPublic"] = []
    blocked_by: list[BlockerInfo] = []   # unfinished FS predecessors
    extra_assignees: list["TaskAssigneePublic"] = []  # co-workers beyond primary assignee
    observers: list["TaskObserverPublic"] = []  # watch-only users
    color: str | None = None
    performance_coefficient: float | None = None


class TasksPublic(SQLModel):
    data: list[TaskPublic]
    count: int


class TaskLinkedEntity(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    entity_type: str = Field(max_length=50)  # purchase_request | material_issue
    entity_id: uuid.UUID = Field(index=True)
    created_by: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    task: Task = Relationship(back_populates="linked_entities")


class TaskLinkedEntityPublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime


class TaskAssigneeAdd(SQLModel):
    user_id: uuid.UUID


class TaskAssigneeRemove(SQLModel):
    user_id: uuid.UUID


class DependencyPublic(SQLModel):
    """Response schema for a task dependency link."""

    id: uuid.UUID
    blocking_task_id: uuid.UUID
    dependent_task_id: uuid.UUID
    dependency_type: str
    lag_hours: int


class GanttPublic(SQLModel):
    """Response schema for the project Gantt endpoint."""

    tasks: list[TaskPublic]
    dependencies: list[DependencyPublic]


# ---------------------------------------------------------------------------
# TaskDependency — "A must finish before B can start"
# ---------------------------------------------------------------------------
class TaskDependency(SQLModel, table=True):
    """
    Finish-to-Start dependency (most common).
    blocking_task MUST be done before dependent_task can start.
    lag_hours: minimum wait after blocking_task is done.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    blocking_task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    dependent_task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    dependency_type: str = Field(default="FS", max_length=2)
    lag_hours: int = Field(default=0)

    blocking_task: Task = Relationship(
        back_populates="blocking",
        sa_relationship_kwargs={"foreign_keys": "[TaskDependency.blocking_task_id]"},
    )
    dependent_task: Task = Relationship(
        back_populates="waiting_for",
        sa_relationship_kwargs={"foreign_keys": "[TaskDependency.dependent_task_id]"},
    )


class TaskDependencyCreate(SQLModel):
    blocking_task_id: uuid.UUID
    dependent_task_id: uuid.UUID
    dependency_type: Literal["FS", "SS", "FF", "SF"] = "FS"
    lag_hours: int = 0


# ---------------------------------------------------------------------------
# TaskObserver — "Watch only" users
# ---------------------------------------------------------------------------
class TaskObserver(SQLModel, table=True):
    """Observers can READ task + comments but cannot write anything."""
    task_id: uuid.UUID = Field(foreign_key="task.id", primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    added_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    task: Task = Relationship(back_populates="observers")


class TaskObserverPublic(SQLModel):
    task_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None = None
    added_at: datetime


class TaskObserverAdd(SQLModel):
    user_id: uuid.UUID


class TaskReassignRequest(SQLModel):
    new_assignee_id: uuid.UUID


# ---------------------------------------------------------------------------
# TaskComment
# ---------------------------------------------------------------------------
class TaskCommentBase(SQLModel):
    content: str = Field(sa_type=Text)
    comment_type: str = Field(default="general", max_length=50)
    # general | progress_report | delay_justification | proof_rejection | defect_note


class TaskComment(TaskCommentBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    author_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    is_edited: bool = False
    edited_at: datetime | None = None
    requested_end_time: datetime | None = None
    approval_status: str | None = Field(default=None, max_length=20)

    task: Task = Relationship(back_populates="comments")
    author: "User" = Relationship(back_populates="comments")  # type: ignore


class TaskCommentCreate(SQLModel):
    content: str
    comment_type: str = "general"
    requested_end_time: datetime | None = None
    approval_status: Literal["PENDING", "APPROVED", "REJECTED"] | None = None


class TaskCommentApprovalUpdate(SQLModel):
    approval_status: Literal["APPROVED", "REJECTED"]


class TaskCommentPublic(TaskCommentBase):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str | None = None
    created_at: datetime
    is_edited: bool
    requested_end_time: datetime | None
    approval_status: str | None


class TaskProgressReport(SQLModel, table=True):
    """Worker-submitted progress: photo URL + self-reported percent for this submission."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    reporter_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    photo_url: str = Field(max_length=1000)
    progress_percent: int
    note: str | None = Field(default=None, sa_type=Text)
    # GPS captured at submission when the task requires check-in
    gps_lat: float | None = None
    gps_lng: float | None = None
    gps_accuracy_m: float | None = None
    # True when check-in was required but GPS could not be captured; the worker
    # supplied a reason instead, flagging this report for manager/director review.
    checkin_skipped: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    task: Task = Relationship(back_populates="progress_reports")


class TaskProgressReportCreate(SQLModel):
    photo_url: str = Field(max_length=1000)
    progress_percent: int = Field(ge=1, le=100)
    note: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    gps_accuracy_m: float | None = None
    checkin_skipped: bool = False


class TaskProgressPhotoUploadPublic(SQLModel):
    """Response after saving a progress-report image to storage."""

    photo_url: str


class TaskProgressReportPublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    reporter_id: uuid.UUID
    reporter_name: str | None = None
    photo_url: str
    progress_percent: int
    note: str | None
    gps_lat: float | None = None
    gps_lng: float | None = None
    gps_accuracy_m: float | None = None
    checkin_skipped: bool = False
    # Distance (metres) from the report's GPS to the task's reference check-in
    # point, and whether it falls inside the allowed radius. None when either
    # the task has no reference point or the report has no GPS.
    distance_m: float | None = None
    location_valid: bool | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# TaskProof — Evidence for task completion (photo, file)
# ---------------------------------------------------------------------------
class TaskProof(SQLModel, table=True):
    """
    Workers upload proof when completing a task.
    GPS + timestamp captured from mobile device to prevent fake submissions.
    Manager/Leader reviews and approves/rejects.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="task.id", index=True)
    uploader_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    file_url: str = Field(max_length=1000)         # S3 URL or local path
    file_type: str = Field(default="image", max_length=20)  # image | video | document
    note: str | None = Field(default=None, sa_type=Text)

    # Mobile device metadata (anti-fraud)
    gps_lat: float | None = None
    gps_lng: float | None = None
    captured_at: datetime | None = None            # Device timestamp from photo metadata
    device_info: str | None = Field(default=None, max_length=255)

    # Review flow
    review_status: str = Field(default="pending", max_length=20)
    # pending | approved | rejected
    reviewer_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    reviewed_at: datetime | None = None
    review_note: str | None = Field(default=None, sa_type=Text)

    uploaded_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    task: Task = Relationship(back_populates="proofs")
    uploader: "User" = Relationship(  # type: ignore
        back_populates="proofs",
        sa_relationship_kwargs={"foreign_keys": "[TaskProof.uploader_id]"},
    )


class TaskProofCreate(SQLModel):
    file_url: str
    file_type: str = "image"
    note: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    captured_at: datetime | None = None
    device_info: str | None = None


class TaskProofPublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    uploader_id: uuid.UUID
    file_url: str
    file_type: str
    note: str | None
    gps_lat: float | None
    gps_lng: float | None
    review_status: str
    reviewer_id: uuid.UUID | None
    uploaded_at: datetime


# ---------------------------------------------------------------------------
# AuditLog — Append-only. Never delete.
# ---------------------------------------------------------------------------
class AuditLog(SQLModel, table=True):
    """
    Tracks ALL write actions across the system.
    Module-agnostic: entity_type is a string, so any future module
    (checkin, approval, payroll) logs to this same table.
    Never DELETE from this table.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    actor_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    action: str = Field(max_length=100, index=True)
    # e.g. "task.status_changed", "task.proof_uploaded", "project.created"

    entity_type: str = Field(max_length=50, index=True)  # "task" | "project" | "checkin"
    entity_id: uuid.UUID = Field(index=True)

    old_value: Any | None = Field(default=None, sa_type=JSON)
    new_value: Any | None = Field(default=None, sa_type=JSON)

    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    actor: "User" = Relationship(back_populates="audit_logs")  # type: ignore


class AuditLogPublic(SQLModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    actor_name: str | None = None
    action: str
    entity_type: str
    entity_id: uuid.UUID
    old_value: Any | None
    new_value: Any | None
    created_at: datetime


# ---------------------------------------------------------------------------
# TaskProfile — reusable task tree template
# ---------------------------------------------------------------------------
class TaskProfile(SQLModel, table=True):
    """Global reusable task tree template. Saved from an existing task subtree."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=300)
    description: str | None = Field(default=None, sa_type=Text)
    created_by: uuid.UUID = Field(foreign_key="user.id", index=True)
    company_id: uuid.UUID | None = Field(default=None, foreign_key="company.id", index=True)
    created_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=_utcnow, sa_type=DateTime(timezone=True)  # type: ignore
    )

    items: list["TaskProfileItem"] = Relationship(
        back_populates="profile",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class TaskProfileItem(SQLModel, table=True):
    """One node in a TaskProfile tree."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    profile_id: uuid.UUID = Field(foreign_key="taskprofile.id", index=True)
    parent_item_id: uuid.UUID | None = Field(default=None, foreign_key="taskprofileitem.id", index=True)
    name: str = Field(max_length=500)
    level: int = Field(default=0)        # 0–4 matching task levels
    duration_days: int = Field(default=1)
    order_index: int = Field(default=0)
    description: str | None = Field(default=None, sa_type=Text)
    module_tag: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=30)

    profile: TaskProfile = Relationship(back_populates="items")


# Schemas
class TaskProfileItemPublic(SQLModel):
    id: uuid.UUID
    profile_id: uuid.UUID
    parent_item_id: uuid.UUID | None
    name: str
    level: int
    duration_days: int
    order_index: int
    description: str | None
    module_tag: str | None
    color: str | None


class TaskProfilePublic(SQLModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_by: uuid.UUID
    created_by_name: str | None = None
    company_id: uuid.UUID | None = None
    created_at: datetime
    items: list[TaskProfileItemPublic] = []


class TaskProfileCreate(SQLModel):
    name: str
    description: str | None = None
    company_id: uuid.UUID | None = None


class TaskProfileUpdate(SQLModel):
    name: str | None = None
    description: str | None = None


class TaskProfileItemCreate(SQLModel):
    parent_item_id: uuid.UUID | None = None
    name: str
    duration_days: int = 1
    order_index: int = 0
    description: str | None = None
    module_tag: str | None = None
    color: str | None = None


class TaskProfileItemUpdate(SQLModel):
    name: str | None = None
    duration_days: int | None = None
    order_index: int | None = None
    description: str | None = None
    module_tag: str | None = None
    color: str | None = None


class ApplyProfileRequest(SQLModel):
    project_id: uuid.UUID
    parent_task_id: uuid.UUID | None = None
    assignee_id: uuid.UUID
    extra_assignee_ids: list[uuid.UUID] = []  # extras applied to every created task


class SaveAsProfileRequest(SQLModel):
    name: str
    description: str | None = None
    company_id: uuid.UUID | None = None
