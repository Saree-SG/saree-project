"""
Task API router — full CRUD, status updates, comments, proofs, dependencies.
Routes: /tasks/ and /projects/{project_id}/tasks/
"""
from __future__ import annotations

import uuid
from datetime import timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, get_db
from app.models.task import (
    AuditLog,
    AuditLogPublic,
    Task,
    TaskChecklist,
    TaskChecklistCreate,
    TaskChecklistPublic,
    TaskChecklistUpdate,
    TaskComment,
    TaskCommentApprovalUpdate,
    TaskCommentCreate,
    TaskCommentPublic,
    TaskCreate,
    TaskDependency,
    TaskDependencyCreate,
    TaskObserver,
    TaskProof,
    TaskProofCreate,
    TaskProofPublic,
    TaskPublic,
    TaskStatusUpdate,
    TaskUpdate,
    TasksPublic,
)
from app.models.user import User
from app.shared.audit import write_audit_log
from app.shared.event_bus import event_bus
from app.shared.permission import require_permission
from app.shared.task_service import (
    TimelineConflict,
    cascade_delay_from,
    enrich_task_public,
    validate_task_timeline,
    utcnow,
)

router = APIRouter(tags=["tasks"])
ALLOWED_DEPENDENCY_TYPES = {"FS", "SS", "FF", "SF"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_task_or_404(session: Session, task_id: uuid.UUID) -> Task:
    t = session.get(Task, task_id)
    if not t or t.is_deleted:
        raise HTTPException(404, "Task not found")
    return t


# ---------------------------------------------------------------------------
# Create task (root or child)
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/tasks", response_model=TaskPublic,
             status_code=status.HTTP_201_CREATED)
def create_root_task(
    project_id: uuid.UUID,
    body: TaskCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_CREATE")),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Create a level-0 (HeadTask) for a project."""
    body.project_id = project_id
    body.parent_id = None
    return _create_task(body, level=0, session=session, current_user=current_user,
                        background_tasks=background_tasks)


@router.post("/tasks/{parent_id}/children", response_model=TaskPublic,
             status_code=status.HTTP_201_CREATED)
def create_child_task(
    parent_id: uuid.UUID,
    body: TaskCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_CREATE")),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Create a sub-task under an existing task. Level auto-computed."""
    parent = _get_task_or_404(session, parent_id)
    body.project_id = parent.project_id
    body.parent_id = parent_id
    return _create_task(body, level=parent.level + 1, session=session,
                        current_user=current_user, background_tasks=background_tasks)


def _create_task(
    body: TaskCreate,
    level: int,
    session: Session,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> TaskPublic:
    try:
        soft_conflicts = validate_task_timeline(
            session,
            task_data=body.model_dump(),
            parent_id=body.parent_id,
        )
    except TimelineConflict as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    task = Task(
        **body.model_dump(),
        level=level,
        assignor_id=current_user.id,
        status="todo",
        is_deleted=False,
    )
    session.add(task)
    session.flush()  # Get task.id before audit

    write_audit_log(session, current_user.id, "task.created", "task", task.id,
                    new_value={"name": task.name, "assignee_id": str(task.assignee_id)})
    session.commit()
    session.refresh(task)

    background_tasks.add_task(
        event_bus.emit, "task.created",
        {"task_id": str(task.id), "project_id": str(task.project_id)},
    )

    result = enrich_task_public(task, session)
    return result


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}", response_model=TaskPublic)
def get_task(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = _get_task_or_404(session, task_id)
    return enrich_task_public(task, session)


@router.get("/projects/{project_id}/tasks", response_model=TasksPublic)
def list_project_tasks(
    project_id: uuid.UUID,
    parent_id: uuid.UUID | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Task).where(Task.project_id == project_id, Task.is_deleted == False)  # noqa
    if parent_id is not None:
        q = q.where(Task.parent_id == parent_id)
    else:
        q = q.where(Task.parent_id == None)  # noqa — root tasks
    if assignee_id:
        q = q.where(Task.assignee_id == assignee_id)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    tasks = session.exec(q.offset(skip).limit(limit)).all()
    return TasksPublic(
        data=[enrich_task_public(t, session) for t in tasks],
        count=total,
    )


@router.get("/tasks/my/dashboard", response_model=dict)
def my_dashboard(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Personal task dashboard: today / due_soon / overdue_critical."""
    now = utcnow()
    base_q = select(Task).where(
        Task.assignee_id == current_user.id,
        Task.is_deleted == False,  # noqa
        Task.status.notin_(["done"]),  # type: ignore
    )

    all_tasks = session.exec(base_q).all()
    today, due_soon, overdue_local, overdue_critical = [], [], [], []

    for t in all_tasks:
        parent = session.get(Task, t.parent_id) if t.parent_id else None
        cs = enrich_task_public(t, session).computed_status
        if cs == "overdue_critical":
            overdue_critical.append(enrich_task_public(t, session))
        elif cs == "overdue_local":
            overdue_local.append(enrich_task_public(t, session))
        elif cs == "due_soon":
            due_soon.append(enrich_task_public(t, session))
        elif t.start_time.date() == now.date() or t.end_time.date() == now.date():
            today.append(enrich_task_public(t, session))

    return {
        "overdue_critical": overdue_critical,
        "overdue_local": overdue_local,
        "due_soon": due_soon,
        "today": today,
    }


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@router.patch("/tasks/{task_id}", response_model=TaskPublic)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE")),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    task = _get_task_or_404(session, task_id)
    old_data = task.model_dump()
    update_data = body.model_dump(exclude_unset=True)

    # Re-validate timeline if time fields changed
    if "start_time" in update_data or "end_time" in update_data:
        merged = {**old_data, **update_data}
        try:
            validate_task_timeline(session, merged, task_id=task_id, parent_id=task.parent_id)
        except TimelineConflict as e:
            raise HTTPException(422, str(e))

    # Check if end_time moved forward (delay) → cascade
    old_end = task.end_time
    for field, val in update_data.items():
        setattr(task, field, val)
    task.updated_at = utcnow()

    session.add(task)
    write_audit_log(session, current_user.id, "task.updated", "task", task.id,
                    old_value=old_data, new_value=update_data)
    session.commit()
    session.refresh(task)

    if "end_time" in update_data and task.end_time > old_end:
        delay_secs = int((task.end_time - old_end).total_seconds())
        background_tasks.add_task(
            cascade_delay_from, session, current_user.id, task, delay_secs, None
        )

    return enrich_task_public(task, session)


@router.patch("/tasks/{task_id}/status", response_model=TaskPublic)
def update_task_status(
    task_id: uuid.UUID,
    body: TaskStatusUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE_STATUS")),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    task = _get_task_or_404(session, task_id)
    old_status = task.status

    # Scope: workers can only update their own task
    if task.assignee_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(403, "Can only update status of own tasks")

    task.status = body.status
    if body.status == "done":
        task.actual_end_time = utcnow()
    task.updated_at = utcnow()

    session.add(task)
    write_audit_log(session, current_user.id, "task.status_changed", "task", task.id,
                    old_value=old_status, new_value=body.status)
    session.commit()
    session.refresh(task)

    background_tasks.add_task(
        event_bus.emit, "task.status_changed",
        {"task_id": str(task.id), "old_status": old_status, "new_status": body.status},
    )
    if body.status == "done":
        background_tasks.add_task(
            event_bus.emit, "task.completed",
            {"task_id": str(task.id), "project_id": str(task.project_id)},
        )

    return enrich_task_public(task, session)


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_DELETE")),
):
    task = _get_task_or_404(session, task_id)
    task.is_deleted = True
    task.deleted_at = utcnow()
    session.add(task)
    write_audit_log(session, current_user.id, "task.deleted", "task", task.id)
    session.commit()


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/clone", response_model=TaskPublic,
             status_code=status.HTTP_201_CREATED)
def clone_task(
    task_id: uuid.UUID,
    new_assignee_id: uuid.UUID | None = None,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_CREATE")),
):
    """Clone a task and its entire subtree. Optionally reassign."""
    task = _get_task_or_404(session, task_id)

    def _clone(original: Task, parent_id: uuid.UUID | None) -> Task:
        cloned = Task(
            project_id=original.project_id,
            parent_id=parent_id,
            level=original.level,
            name=f"[Clone] {original.name}",
            description=original.description,
            priority=original.priority,
            start_time=original.start_time,
            end_time=original.end_time,
            status="todo",
            assignor_id=current_user.id,
            assignee_id=new_assignee_id or original.assignee_id,
            is_deleted=False,
        )
        session.add(cloned)
        session.flush()
        children = session.exec(
            select(Task).where(Task.parent_id == original.id, Task.is_deleted == False)  # noqa
        ).all()
        for child in children:
            _clone(child, cloned.id)
        return cloned

    cloned_root = _clone(task, task.parent_id)
    session.commit()
    session.refresh(cloned_root)
    return enrich_task_public(cloned_root, session)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/comments", response_model=TaskCommentPublic,
             status_code=status.HTTP_201_CREATED)
def add_comment(
    task_id: uuid.UUID,
    body: TaskCommentCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("COMMENT_ADD")),
):
    """Add a task comment or delay request note."""
    _get_task_or_404(session, task_id)
    if body.comment_type == "delay_justification" and body.requested_end_time is None:
        raise HTTPException(422, "requested_end_time is required for delay_justification")
    approval_status = body.approval_status
    if body.comment_type == "delay_justification" and approval_status is None:
        approval_status = "PENDING"
    comment = TaskComment(
        task_id=task_id,
        author_id=current_user.id,
        content=body.content,
        comment_type=body.comment_type,
        requested_end_time=body.requested_end_time,
        approval_status=approval_status,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment


@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentPublic])
def list_comments(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_task_or_404(session, task_id)
    return session.exec(
        select(TaskComment)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
    ).all()


@router.patch(
    "/tasks/{task_id}/comments/{comment_id}/approval",
    response_model=TaskCommentPublic,
)
def approve_delay_request(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: TaskCommentApprovalUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE")),
):
    """Approve or reject delay request and update task deadline when approved."""
    task = _get_task_or_404(session, task_id)
    comment = session.get(TaskComment, comment_id)
    if comment is None or comment.task_id != task_id:
        raise HTTPException(404, "Comment not found")
    if comment.comment_type != "delay_justification":
        raise HTTPException(422, "Only delay_justification comments can be approved")
    if comment.requested_end_time is None:
        raise HTTPException(422, "Delay request missing requested_end_time")

    old_comment_status = comment.approval_status
    old_end_time = task.end_time
    comment.approval_status = body.approval_status
    if body.approval_status == "APPROVED":
        task.end_time = comment.requested_end_time
        task.updated_at = utcnow()
        write_audit_log(
            session,
            current_user.id,
            "task.delay_request_approved",
            "task",
            task.id,
            old_value={"end_time": old_end_time.isoformat()},
            new_value={"end_time": task.end_time.isoformat()},
        )
        session.add(task)

    write_audit_log(
        session,
        current_user.id,
        "task.delay_request_reviewed",
        "task_comment",
        comment.id,
        old_value={"approval_status": old_comment_status},
        new_value={"approval_status": body.approval_status},
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment


# ---------------------------------------------------------------------------
# Proofs
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/proofs", response_model=TaskProofPublic,
             status_code=status.HTTP_201_CREATED)
def upload_proof(
    task_id: uuid.UUID,
    body: TaskProofCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROOF_UPLOAD")),
):
    task = _get_task_or_404(session, task_id)
    if task.assignee_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(403, "Only the assignee can upload proof")

    proof = TaskProof(task_id=task_id, uploader_id=current_user.id, **body.model_dump())
    session.add(proof)
    write_audit_log(session, current_user.id, "task.proof_uploaded", "task", task_id,
                    new_value={"file_url": body.file_url})
    session.commit()
    session.refresh(proof)
    return proof


@router.patch("/tasks/{task_id}/proofs/{proof_id}", response_model=TaskProofPublic)
def review_proof(
    task_id: uuid.UUID,
    proof_id: uuid.UUID,
    review_status: str,  # approved | rejected
    review_note: str | None = None,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("PROOF_APPROVE")),
):
    proof = session.get(TaskProof, proof_id)
    if not proof or proof.task_id != task_id:
        raise HTTPException(404, "Proof not found")
    old_status = proof.review_status
    proof.review_status = review_status
    proof.reviewer_id = current_user.id
    proof.reviewed_at = utcnow()
    proof.review_note = review_note
    session.add(proof)
    write_audit_log(session, current_user.id, "task.proof_reviewed", "task", task_id,
                    old_value=old_status, new_value=review_status)
    session.commit()
    session.refresh(proof)
    return proof


@router.get("/tasks/{task_id}/proofs", response_model=list[TaskProofPublic])
def list_proofs(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_task_or_404(session, task_id)
    return session.exec(
        select(TaskProof).where(TaskProof.task_id == task_id).order_by(TaskProof.uploaded_at)
    ).all()


# ---------------------------------------------------------------------------
# Dependencies (Gantt links)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/dependencies", status_code=status.HTTP_201_CREATED)
def add_dependency(
    task_id: uuid.UUID,
    body: TaskDependencyCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE")),
):
    """Create dependency link between two tasks."""
    if body.dependency_type not in ALLOWED_DEPENDENCY_TYPES:
        raise HTTPException(422, "dependency_type must be one of FS, SS, FF, SF")
    existing = session.exec(
        select(TaskDependency).where(
            TaskDependency.blocking_task_id == body.blocking_task_id,
            TaskDependency.dependent_task_id == body.dependent_task_id,
        )
    ).first()
    if existing:
        raise HTTPException(409, "Dependency already exists")
    dep = TaskDependency(**body.model_dump())
    session.add(dep)
    session.commit()
    return {"message": "Dependency added"}


@router.post(
    "/tasks/{task_id}/checklists",
    response_model=TaskChecklistPublic,
    status_code=status.HTTP_201_CREATED,
)
def add_checklist_item(
    task_id: uuid.UUID,
    body: TaskChecklistCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE_STATUS")),
):
    """Create checklist item for task."""
    _get_task_or_404(session, task_id)
    item = TaskChecklist(task_id=task_id, content=body.content)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.get("/tasks/{task_id}/checklists", response_model=list[TaskChecklistPublic])
def list_checklist_items(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List checklist items for task."""
    _get_task_or_404(session, task_id)
    return session.exec(
        select(TaskChecklist)
        .where(TaskChecklist.task_id == task_id)
        .order_by(TaskChecklist.created_at)
    ).all()


@router.patch(
    "/tasks/{task_id}/checklists/{checklist_id}",
    response_model=TaskChecklistPublic,
)
def update_checklist_item(
    task_id: uuid.UUID,
    checklist_id: uuid.UUID,
    body: TaskChecklistUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permission("TASK_UPDATE_STATUS")),
):
    """Toggle checklist completion state."""
    _get_task_or_404(session, task_id)
    item = session.get(TaskChecklist, checklist_id)
    if item is None or item.task_id != task_id:
        raise HTTPException(404, "Checklist item not found")
    item.is_completed = body.is_completed
    if body.is_completed:
        item.completed_by = current_user.id
        item.completed_at = utcnow()
    else:
        item.completed_by = None
        item.completed_at = None
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}/audit", response_model=list[AuditLogPublic])
def get_task_audit(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_task_or_404(session, task_id)
    return session.exec(
        select(AuditLog)
        .where(AuditLog.entity_type == "task", AuditLog.entity_id == task_id)
        .order_by(AuditLog.created_at)
    ).all()


# ---------------------------------------------------------------------------
# Timeline conflict check
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}/conflicts", response_model=dict)
def check_conflicts(
    task_id: uuid.UUID,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = _get_task_or_404(session, task_id)
    try:
        soft = validate_task_timeline(
            session, task.model_dump(), task_id=task.id, parent_id=task.parent_id
        )
    except TimelineConflict as e:
        return {"has_hard_conflict": True, "detail": str(e), "soft_conflicts": []}
    return {"has_hard_conflict": False, "soft_conflicts": soft}
