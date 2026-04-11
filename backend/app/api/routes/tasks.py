"""
Task management routes — full async, no direct DB calls.

All DB operations are delegated to TaskService which uses TaskRepository.
Routes only: validate input → call service → return response.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.task import (
    AuditLogPublic,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCommentPublic,
    TaskCreate,
    TaskDependencyCreate,
    TaskProgressPhotoUploadPublic,
    TaskProgressReportCreate,
    TaskProgressReportPublic,
    TaskProofCreate,
    TaskProofPublic,
    TaskPublic,
    TasksPublic,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.models.user import User
from app.services.task_service import TaskService
from app.shared.permission import require_permission
from app.shared.storage import LocalStorage

router = APIRouter(tags=["tasks"])

_progress_storage = LocalStorage(base_dir="uploads/task_progress", static_url_segment="task_progress")


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
    """Create a sub-task under an existing task."""
    svc = _svc(session)
    parent = await svc._task_repo.get_or_404(parent_id)
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


# ---------------------------------------------------------------------------
# Proofs
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/proofs",
    response_model=TaskProofPublic,
    status_code=status.HTTP_201_CREATED,
)
async def upload_proof(
    task_id: uuid.UUID,
    body: TaskProofCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_UPLOAD")),
) -> TaskProofPublic:
    """Upload proof for task completion."""
    return await _svc(session).upload_proof(task_id, body, current_user)


@router.patch("/tasks/{task_id}/proofs/{proof_id}", response_model=TaskProofPublic)
async def review_proof(
    task_id: uuid.UUID,
    proof_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_APPROVE")),
    review_status: str = Query(...),
    review_note: str | None = Query(default=None),
) -> TaskProofPublic:
    """Review a task proof (approved | rejected)."""
    return await _svc(session).review_proof(
        task_id, proof_id, review_status, review_note, current_user
    )


@router.get("/tasks/{task_id}/proofs", response_model=list[TaskProofPublic])
async def list_proofs(
    task_id: uuid.UUID,
    session: AsyncSessionDep,
    _current_user: CurrentUser,
) -> list[TaskProofPublic]:
    """List proofs for a task."""
    return await _svc(session).list_proofs(task_id)


# ---------------------------------------------------------------------------
# Dependencies (Gantt links)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/dependencies", status_code=status.HTTP_201_CREATED)
async def add_dependency(
    task_id: uuid.UUID,
    body: TaskDependencyCreate,
    session: AsyncSessionDep,
    _current_user: User = Depends(require_permission("TASK_UPDATE")),
) -> dict:
    """Create a dependency link between two tasks."""
    return await _svc(session).add_dependency(task_id, body, _current_user)


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
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(422, "File must be an image")
    try:
        stored = await _progress_storage.save_upload(file)
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
    body: TaskProgressReportCreate,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("PROOF_UPLOAD")),
) -> TaskProgressReportPublic:
    """Worker submits photo URL and percent; auto transitions task status."""
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
