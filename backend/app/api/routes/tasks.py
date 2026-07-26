"""
Task management routes — full async, no direct DB calls.

All DB operations are delegated to TaskService which uses TaskRepository.
Routes only: validate input → call service → return response.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.core.config import settings
from app.models.task import (
    AuditLogPublic,
    GanttPublic,
    TaskAssigneeAdd,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCommentPublic,
    TaskCreate,
    TaskDependencyCreate,
    TaskObserverAdd,
    TaskProgressPhotoUploadPublic,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskPublic,
    TaskReassignRequest,
    TasksPublic,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.models.project import Project
from app.models.user import User
from app.services import travel as _travel
from app.services.task_service import TaskService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(tags=["tasks"])

_progress_storage = LocalStorage(
    base_dir=settings.TASK_PROGRESS_UPLOAD_DIR,
    static_url_segment="task-progress",
)

# Progress reports accept photos plus common office/document formats.
_PROGRESS_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_PROGRESS_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024  # 25 MB for Word/Excel/PowerPoint/PDF


def _validate_progress_upload(file: UploadFile) -> int | None:
    """Check the progress-report file's content type; return a max_bytes override, or raise 422."""
    content_type = (file.content_type or "").lower()
    if content_type.startswith("image/"):
        return None
    if content_type in _PROGRESS_DOCUMENT_CONTENT_TYPES:
        return _PROGRESS_DOCUMENT_MAX_BYTES
    raise HTTPException(
        422,
        "File phải là ảnh hoặc tài liệu (Word, Excel, PowerPoint, PDF)",
    )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _svc(session: AsyncSession) -> TaskService:
    """Build a TaskService bound to the request's async session."""
    return TaskService(session)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_root_task(
    project_id: uuid.UUID,
    body: TaskCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_CREATE")),
) -> TaskPublic:
    """Create a level-0 (HeadTask) for a project."""
    body.project_id = project_id
    body.parent_id = None
    return await _svc(session).create_task(body, level=0, current_user=current_user)


@router.post(
    "/tasks/{parent_id}/children",
    response_model=TaskPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_child_task(
    parent_id: uuid.UUID,
    body: TaskCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_CREATE")),
) -> TaskPublic:
    """Create a child task up to level 4 (5 levels: Hạng mục → Công việc → Đầu việc → Bước → Chi tiết)."""
    svc = _svc(session)
    parent = await svc._task_repo.get_or_404(parent_id)
    if parent.level >= 4:
        raise HTTPException(
            422,
            "Đã đạt giới hạn 5 tầng (Hạng mục → Công việc → Đầu việc → Bước → Chi tiết).",
        )
    if parent.status == "done":
        raise HTTPException(
            422,
            "Không thể thêm công việc con vào công việc cha đã hoàn thành.",
        )
    body.project_id = parent.project_id
    body.parent_id = parent_id
    return await svc.create_task(body, level=parent.level + 1, current_user=current_user)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("/tasks/my/dashboard", response_model=dict)
async def my_dashboard(
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> dict:
    """Personal task dashboard with company/project metadata."""
    return await _svc(session).my_dashboard(current_user)


@router.get("/tasks/{task_id}", response_model=TaskPublic)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> TaskPublic:
    """Fetch a task with computed status."""
    return await _svc(session).get_task(task_id)


@router.get("/projects/{project_id}/tasks", response_model=TasksPublic)
async def list_project_tasks(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
    parent_id: uuid.UUID | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
) -> TasksPublic:
    """List tasks in a project with optional filters."""
    root_only = parent_id is None
    return await _svc(session).list_project_tasks(
        project_id,
        parent_id=parent_id,
        filter_root_only=root_only,
        assignee_id=assignee_id,
        skip=skip,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@router.patch("/tasks/{task_id}", response_model=TaskPublic)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskPublic:
    """Update task fields; triggers cascade if end_time is extended."""
    return await _svc(session).update_task(task_id, body, current_user)


@router.patch("/tasks/{task_id}/status", response_model=TaskPublic)
async def update_task_status(
    task_id: uuid.UUID,
    body: TaskStatusUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE_STATUS")),
) -> TaskPublic:
    """Update task status (assignee only unless superuser)."""
    return await _svc(session).update_task_status(task_id, body, current_user)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_DELETE")),
) -> None:
    """Soft-delete a task."""
    await _svc(session).delete_task(task_id, current_user)


# ---------------------------------------------------------------------------
# Extra assignees
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/assignees",
    response_model=TaskPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_extra_assignee(
    task_id: uuid.UUID,
    body: TaskAssigneeAdd,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskPublic:
    """Add a co-worker to a task (extra assignee)."""
    return await _svc(session).add_extra_assignee(task_id, body, current_user)


@router.delete("/tasks/{task_id}/assignees/{user_id}", response_model=TaskPublic)
async def remove_extra_assignee(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskPublic:
    """Remove a co-worker from a task."""
    return await _svc(session).remove_extra_assignee(task_id, user_id, current_user)


# ---------------------------------------------------------------------------
# Observers
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/observers",
    response_model=TaskPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_observer(
    task_id: uuid.UUID,
    body: TaskObserverAdd,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskPublic:
    """Add a watch-only observer to a task."""
    return await _svc(session).add_observer(task_id, body, current_user)


@router.delete("/tasks/{task_id}/observers/{user_id}", response_model=TaskPublic)
async def remove_observer(
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskPublic:
    """Remove an observer from a task."""
    return await _svc(session).remove_observer(task_id, user_id, current_user)


# ---------------------------------------------------------------------------
# Reassign primary assignee
# ---------------------------------------------------------------------------

@router.patch("/tasks/{task_id}/reassign", response_model=TaskPublic)
async def reassign_task(
    task_id: uuid.UUID,
    body: TaskReassignRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_REASSIGN")),
) -> TaskPublic:
    """Transfer the primary assignee to another user.
    Old assignee is moved to extra_assignees automatically."""
    return await _svc(session).reassign_task(task_id, body, current_user)


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/clone",
    response_model=TaskPublic,
    status_code=status.HTTP_201_CREATED,
)
async def clone_task(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_CREATE")),
    new_assignee_id: uuid.UUID | None = None,
) -> TaskPublic:
    """Clone a task and its entire subtree. Optionally reassign."""
    return await _svc(session).clone_task(task_id, current_user, new_assignee_id)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/comments",
    response_model=TaskCommentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    task_id: uuid.UUID,
    body: TaskCommentCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("COMMENT_ADD")),
) -> TaskCommentPublic:
    """Add a task comment or delay request note."""
    return await _svc(session).add_comment(task_id, body, current_user)


@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentPublic])
async def list_comments(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[TaskCommentPublic]:
    """List task comments with author names."""
    return await _svc(session).list_comments(task_id)


@router.patch(
    "/tasks/{task_id}/comments/{comment_id}/approval",
    response_model=TaskCommentPublic,
)
async def approve_delay_request(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: TaskCommentApprovalUpdate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> TaskCommentPublic:
    """Approve or reject a delay request; update task deadline when approved."""
    return await _svc(session).approve_delay(task_id, comment_id, body, current_user)



@router.post("/tasks/{task_id}/dependencies", status_code=status.HTTP_201_CREATED)
async def add_dependency(
    task_id: uuid.UUID,
    body: TaskDependencyCreate,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> dict:
    """Create a dependency link between two tasks."""
    return await _svc(session).add_dependency(task_id, body, _current_user)


@router.delete(
    "/tasks/{task_id}/dependencies/{dep_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_dependency(
    task_id: uuid.UUID,
    dep_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> None:
    """Remove a dependency link and recalculate the critical path."""
    await _svc(session).remove_dependency(task_id, dep_id, _current_user)


# ---------------------------------------------------------------------------
# Gantt
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/gantt", response_model=GanttPublic)
async def get_project_gantt(
    project_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> GanttPublic:
    """Return all tasks + dependency links for the project Gantt chart."""
    return await _svc(session).get_project_gantt(project_id)


# ---------------------------------------------------------------------------
# Progress reports
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/progress-reports/upload-photo",
    response_model=TaskProgressPhotoUploadPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_progress_report_photo(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_UPLOAD")),
    file: UploadFile = File(...),
) -> TaskProgressPhotoUploadPublic:
    """Persist an image from the assignee's device; returns photo_url."""
    svc = _svc(session)
    task = await svc._task_repo.get_or_404(task_id)
    if task.status == "done":
        raise HTTPException(422, "Task is already completed")
    if task.assignee_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(403, "Only the assignee can upload progress photos")
    max_bytes = _validate_progress_upload(file)
    try:
        kwargs = {} if max_bytes is None else {"max_bytes": max_bytes}
        stored = await _progress_storage.save_upload(file, **kwargs)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return TaskProgressPhotoUploadPublic(photo_url=stored.public_url)


@router.post(
    "/tasks/{task_id}/progress-reports",
    response_model=TaskProgressReportPublic,
    status_code=status.HTTP_201_CREATED,
)
async def add_progress_report(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_UPLOAD")),
    file: UploadFile = File(...),
    progress_percent: int = Form(..., ge=1, le=100),
    note: str | None = Form(default=None),
    gps_lat: float | None = Form(default=None),
    gps_lng: float | None = Form(default=None),
    gps_accuracy_m: float | None = Form(default=None),
    checkin_skip_reason: str | None = Form(default=None),
) -> TaskProgressReportPublic:
    """
    Upload progress photo and create the report atomically in one request.
    Accepts multipart/form-data: file (image), progress_percent (1-100), note (optional),
    optional GPS (gps_lat/gps_lng), and checkin_skip_reason.

    When the task has requires_checkin = True, the submission must include either
    GPS coordinates OR a checkin_skip_reason (device cannot locate) — the latter
    flags the report for manager/director review.
    """
    max_bytes = _validate_progress_upload(file)

    svc = _svc(session)
    task = await svc._task_repo.get_or_404(task_id)
    has_gps = gps_lat is not None and gps_lng is not None
    checkin_skipped = False
    if task.requires_checkin and not has_gps:
        if not (checkin_skip_reason and checkin_skip_reason.strip()):
            raise HTTPException(
                422,
                "Công việc này yêu cầu check-in vị trí. Nếu thiết bị không định vị "
                "được, hãy nhập lý do để báo quản lý.",
            )
        checkin_skipped = True
        reason = f"[Không check-in được — {checkin_skip_reason.strip()}]"
        note = " ".join(filter(None, [note, reason]))

    try:
        kwargs = {} if max_bytes is None else {"max_bytes": max_bytes}
        stored = await _progress_storage.save_upload(file, **kwargs)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    body = TaskProgressReportCreate(
        photo_url=stored.public_url,
        progress_percent=progress_percent,
        note=note,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        gps_accuracy_m=gps_accuracy_m,
        checkin_skipped=checkin_skipped,
    )
    return await _svc(session).add_progress_report(task_id, body, current_user)


@router.get(
    "/tasks/{task_id}/progress-reports",
    response_model=list[TaskProgressReportPublic],
)
async def list_progress_reports(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[TaskProgressReportPublic]:
    """List worker progress submissions for a task."""
    return await _svc(session).list_progress_reports(task_id)


@router.patch(
    "/tasks/{task_id}/progress-reports/{report_id}",
    response_model=TaskProgressReportPublic,
)
async def review_progress_report(
    task_id: uuid.UUID,
    report_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_APPROVE")),
    review_status: str = Query(...),
    review_note: str | None = Query(default=None),
) -> TaskProgressReportPublic:
    """Approve or reject a progress report (its on-site photo is the evidence)."""
    return await _svc(session).review_progress_report(
        task_id, report_id, review_status, review_note, current_user
    )


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}/audit", response_model=list[AuditLogPublic])
async def get_task_audit(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[AuditLogPublic]:
    """Return audit log for a task."""
    return await _svc(session).get_audit(task_id)


# ---------------------------------------------------------------------------
# Timeline conflict check
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}/conflicts", response_model=dict)
async def check_conflicts(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> dict:
    """Check timeline conflicts for a task."""
    return await _svc(session).check_conflicts(task_id)


# ---------------------------------------------------------------------------
# Dispatch conflict check (Gap 29-31, Bước 6)
# ---------------------------------------------------------------------------

from datetime import datetime as _dt  # noqa: E402
from pydantic import BaseModel as _BM  # noqa: E402
from sqlmodel import select as _select  # noqa: E402


class _ConflictCheckBody(_BM):
    assignee_id: uuid.UUID
    project_id: uuid.UUID
    start_time: _dt
    end_time: _dt
    arrive_at: _dt | None = None


@router.post("/tasks/check-conflict", response_model=dict)
async def check_dispatch_conflict(
    body: _ConflictCheckBody,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> dict:
    """Kiểm tra xung đột lịch và khả năng di chuyển trước khi giao việc.

    Trả về:
    - overlaps: danh sách task đang trùng khung giờ của assignee.
    - travel: ước tính thời gian di chuyển (nếu arrive_at được cung cấp và
      task trước có vị trí).
    """
    from sqlalchemy import and_

    # 1. Overlap check — open tasks of assignee overlapping [start, end]
    overlap_q = await session.execute(
        _select(Task, Project.name.label("project_name"))
        .join(Project, Task.project_id == Project.id)  # type: ignore[arg-type]
        .where(
            Task.assignee_id == body.assignee_id,
            Task.project_id != body.project_id,
            Task.status.not_in(["done", "cancelled"]),  # type: ignore[union-attr]
            Task.is_deleted == False,  # noqa: E712
            and_(Task.start_time < body.end_time, Task.end_time > body.start_time),
        )
    )
    overlap_rows = overlap_q.all()
    overlaps = [
        {"task_id": str(row.Task.id), "task_name": row.Task.name, "project_name": row.project_name}
        for row in overlap_rows
    ]

    # 2. Travel feasibility — requires arrive_at + previous task location
    travel_info: dict | None = None
    if body.arrive_at:
        # Find the task that ends most recently before body.start_time
        prev_q = await session.execute(
            _select(Task, Project.site_lat.label("slat"), Project.site_lng.label("slng"))
            .join(Project, Task.project_id == Project.id)  # type: ignore[arg-type]
            .where(
                Task.assignee_id == body.assignee_id,
                Task.status.not_in(["done", "cancelled"]),  # type: ignore[union-attr]
                Task.is_deleted == False,  # noqa: E712
                Task.end_time <= body.start_time,
            )
            .order_by(Task.end_time.desc())  # type: ignore[union-attr]
            .limit(1)
        )
        prev_row = prev_q.first()

        # Destination site coords
        dest_q = await session.execute(
            _select(Project.site_lat, Project.site_lng).where(Project.id == body.project_id)
        )
        dest = dest_q.first()

        if prev_row and prev_row.slat and prev_row.slng and dest and dest.site_lat and dest.site_lng:
            travel_info = _travel.check_travel_feasibility(
                from_lat=prev_row.slat,
                from_lng=prev_row.slng,
                to_lat=dest.site_lat,
                to_lng=dest.site_lng,
                departure_time=prev_row.Task.end_time,
                must_arrive_by=body.arrive_at,
            )
        elif dest and dest.site_lat and dest.site_lng:
            # No previous located task — can't compute travel, just note destination exists
            travel_info = None

    return {"overlaps": overlaps, "travel": travel_info}


# ---------------------------------------------------------------------------
# Task handoff — bàn giao giữ % (Bước 7)
# ---------------------------------------------------------------------------

class _HandoffBody(_BM):
    new_assignee_id: uuid.UUID
    note: str | None = None   # lý do bàn giao (tuỳ chọn)


@router.post("/tasks/{task_id}/handoff", response_model=TaskPublic)
async def handoff_task(
    task_id: uuid.UUID,
    body: _HandoffBody,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskPublic:
    """Bàn giao công việc sang người khác — giữ nguyên % tiến độ hiện tại.

    - Tạo task mới cùng project/parent, copy reported_progress_total,
      set continues_task_id → task gốc, handoff_from_user_id → người bàn giao.
    - Task gốc chuyển sang status=paused với pause_note ghi lý do bàn giao.
    - Chỉ assignee hiện tại hoặc assignor hoặc superuser được bàn giao.
    """
    task = await _svc(session).get_task(task_id)
    if task.status == "done":
        raise HTTPException(422, "Công việc đã hoàn thành, không thể bàn giao.")

    is_assignee = task.assignee_id == current_user.id
    is_assignor = task.assignor_id == current_user.id
    if not is_assignee and not is_assignor and not current_user.is_superuser:
        raise HTTPException(403, "Chỉ người thực hiện hoặc người giao việc mới có thể bàn giao.")

    from app.models.task import Task as _Task
    from sqlmodel import select as _sel2

    # Load raw task to access all fields
    raw_q = await session.execute(_sel2(_Task).where(_Task.id == task_id))
    raw = raw_q.scalar_one_or_none()
    if not raw:
        raise HTTPException(404, "Task not found")

    pause_note = body.note or f"Bàn giao cho nhân viên khác (tiến độ giữ nguyên {raw.reported_progress_total}%)"

    # Pause the original task
    await _svc(session).update_task_status(
        task_id,
        __import__("app.models.task", fromlist=["TaskStatusUpdate"]).TaskStatusUpdate(
            status="paused", pause_note=pause_note
        ),
        current_user,
    )

    # Create continuation task
    new_task = _Task(
        project_id=raw.project_id,
        parent_id=raw.parent_id,
        name=raw.name,
        description=raw.description,
        priority=raw.priority,
        start_time=raw.start_time,
        end_time=raw.end_time,
        assignor_id=raw.assignor_id,
        assignee_id=body.new_assignee_id,
        level=raw.level,
        status="in_progress",
        requires_checkin=raw.requires_checkin,
        checkin_lat=raw.checkin_lat,
        checkin_lng=raw.checkin_lng,
        checkin_radius_m=raw.checkin_radius_m,
        required_headcount=raw.required_headcount,
        estimated_hours=raw.estimated_hours,
        module_tag=raw.module_tag,
        handoff_from_user_id=raw.assignee_id,
        continues_task_id=raw.id,
    )
    session.add(new_task)
    await session.flush()
    await session.refresh(new_task)

    # Copy reported progress so new assignee starts from where previous left off
    if raw.reported_progress_total and raw.reported_progress_total > 0:
        new_task.reported_progress_total = raw.reported_progress_total
        session.add(new_task)
        await session.flush()

    from app.repositories.audit_repository import AuditRepository
    audit = AuditRepository(session)
    await audit.write(
        actor_id=current_user.id,
        action="task.handoff",
        entity_type="task",
        entity_id=task_id,
        old_value=str(raw.assignee_id),
        new_value=str(body.new_assignee_id),
    )

    await session.refresh(new_task)
    return await _svc(session).get_task(new_task.id)


# ── Điều phối: gợi ý nhân sự ─────────────────────────────────────────────────

class _CandidateOut(_BM):
    user_id: uuid.UUID
    user_name: str
    skill_name: str
    skill_level: int
    workload_pct: float
    load_status: str
    current_task_name: str | None
    current_site_name: str | None
    distance_km: float | None
    eta_minutes: int | None
    score: float
    impact: str


@router.get("/tasks/{task_id}/suggest-assignees", response_model=list[_CandidateOut])
async def suggest_assignees(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
    limit: int = 10,
):
    """Trả danh sách nhân sự phù hợp nhất để bổ sung vào task."""
    from app.services.dispatch import suggest_assignees as _suggest
    return await _suggest(
        session=session,
        task_id=task_id,
        company_id=current_user.company_id,
        limit=limit,
    )
