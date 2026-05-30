"""
Task Profile routes — manage reusable task tree templates.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AsyncSessionDep, CurrentUser
from app.models.task import (
    ApplyProfileRequest,
    SaveAsProfileRequest,
    Task,
    TaskAssignee,
    TaskCreate,
    TaskProfile,
    TaskProfileCreate,
    TaskProfileItem,
    TaskProfileItemCreate,
    TaskProfileItemPublic,
    TaskProfileItemUpdate,
    TaskProfilePublic,
    TaskProfileUpdate,
)
from app.models.user import User
from app.services.task_service import TaskService
from app.shared.permission import require_permission

router = APIRouter(prefix="/task-profiles", tags=["task-profiles"])

LEVEL_NAMES = ["Hạng mục", "Công việc", "Đầu việc", "Bước", "Chi tiết"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_profile_or_404(session: AsyncSession, profile_id: uuid.UUID) -> TaskProfile:
    result = await session.execute(select(TaskProfile).where(TaskProfile.id == profile_id))
    p = result.scalars().first()
    if not p:
        raise HTTPException(404, "Không tìm thấy mẫu công việc.")
    return p


async def _build_profile_public(session: AsyncSession, profile: TaskProfile) -> TaskProfilePublic:
    # Load items
    items_result = await session.execute(
        select(TaskProfileItem).where(TaskProfileItem.profile_id == profile.id)
        .order_by(TaskProfileItem.level, TaskProfileItem.order_index)
    )
    items = items_result.scalars().all()

    # Load creator name
    user_result = await session.execute(select(User).where(User.id == profile.created_by))
    creator = user_result.scalars().first()

    return TaskProfilePublic(
        id=profile.id,
        name=profile.name,
        description=profile.description,
        created_by=profile.created_by,
        created_by_name=creator.full_name if creator else None,
        company_id=profile.company_id,
        created_at=profile.created_at,
        items=[TaskProfileItemPublic.model_validate(i) for i in items],
    )


async def _collect_subtree(
    session: AsyncSession, task_id: uuid.UUID
) -> list[Task]:
    """BFS collect a task and all its descendants."""
    result = await session.execute(select(Task).where(Task.id == task_id, Task.is_deleted == False))  # noqa: E712
    root = result.scalars().first()
    if not root:
        return []
    collected: list[Task] = [root]
    queue = [task_id]
    while queue:
        batch_ids = queue
        queue = []
        children_result = await session.execute(
            select(Task).where(Task.parent_id.in_(batch_ids), Task.is_deleted == False)  # noqa: E712
        )
        children = children_result.scalars().all()
        for c in children:
            collected.append(c)
            queue.append(c.id)
    return collected


# ---------------------------------------------------------------------------
# CRUD profile
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[TaskProfilePublic])
async def list_profiles(
    session: AsyncSessionDep,
    current_user: CurrentUser,
    company_id: Optional[uuid.UUID] = Query(default=None),
) -> list[TaskProfilePublic]:
    stmt = select(TaskProfile).order_by(TaskProfile.created_at.desc())
    if company_id is not None:
        stmt = stmt.where(TaskProfile.company_id == company_id)
    result = await session.execute(stmt)
    profiles = result.scalars().all()
    return [await _build_profile_public(session, p) for p in profiles]


@router.post("/", response_model=TaskProfilePublic, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: TaskProfileCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfilePublic:
    profile = TaskProfile(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
        company_id=body.company_id,
    )
    session.add(profile)
    await session.flush()
    return await _build_profile_public(session, profile)


@router.get("/{profile_id}", response_model=TaskProfilePublic)
async def get_profile(
    profile_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfilePublic:
    profile = await _get_profile_or_404(session, profile_id)
    return await _build_profile_public(session, profile)


@router.patch("/{profile_id}", response_model=TaskProfilePublic)
async def update_profile(
    profile_id: uuid.UUID,
    body: TaskProfileUpdate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfilePublic:
    profile = await _get_profile_or_404(session, profile_id)
    if body.name is not None:
        profile.name = body.name
    if body.description is not None:
        profile.description = body.description
    profile.updated_at = datetime.now(timezone.utc)
    session.add(profile)
    await session.flush()
    return await _build_profile_public(session, profile)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    profile = await _get_profile_or_404(session, profile_id)
    await session.delete(profile)
    await session.flush()


# ---------------------------------------------------------------------------
# Profile items CRUD
# ---------------------------------------------------------------------------

@router.post("/{profile_id}/items", response_model=TaskProfileItemPublic, status_code=status.HTTP_201_CREATED)
async def add_profile_item(
    profile_id: uuid.UUID,
    body: TaskProfileItemCreate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfileItemPublic:
    profile = await _get_profile_or_404(session, profile_id)

    # Determine level
    level = 0
    if body.parent_item_id:
        parent_result = await session.execute(
            select(TaskProfileItem).where(
                TaskProfileItem.id == body.parent_item_id,
                TaskProfileItem.profile_id == profile.id,
            )
        )
        parent_item = parent_result.scalars().first()
        if not parent_item:
            raise HTTPException(404, "Không tìm thấy mục cha trong mẫu.")
        if parent_item.level >= 4:
            raise HTTPException(422, "Đã đạt giới hạn 5 tầng.")
        level = parent_item.level + 1

    item = TaskProfileItem(
        profile_id=profile.id,
        parent_item_id=body.parent_item_id,
        name=body.name,
        level=level,
        duration_days=body.duration_days,
        order_index=body.order_index,
        description=body.description,
        module_tag=body.module_tag,
        color=body.color,
    )
    session.add(item)
    await session.flush()
    return TaskProfileItemPublic.model_validate(item)


@router.patch("/items/{item_id}", response_model=TaskProfileItemPublic)
async def update_profile_item(
    item_id: uuid.UUID,
    body: TaskProfileItemUpdate,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfileItemPublic:
    result = await session.execute(select(TaskProfileItem).where(TaskProfileItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(404, "Không tìm thấy mục.")
    if body.name is not None:
        item.name = body.name
    if body.duration_days is not None:
        item.duration_days = body.duration_days
    if body.order_index is not None:
        item.order_index = body.order_index
    if body.description is not None:
        item.description = body.description
    if body.module_tag is not None:
        item.module_tag = body.module_tag
    if body.color is not None:
        item.color = body.color
    session.add(item)
    await session.flush()
    return TaskProfileItemPublic.model_validate(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile_item(
    item_id: uuid.UUID,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> None:
    result = await session.execute(select(TaskProfileItem).where(TaskProfileItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(404, "Không tìm thấy mục.")

    # Delete entire subtree bottom-up (children first to avoid FK violations)
    async def _delete_subtree(node_id: uuid.UUID) -> None:
        children_result = await session.execute(
            select(TaskProfileItem).where(TaskProfileItem.parent_item_id == node_id)
        )
        for child in children_result.scalars().all():
            await _delete_subtree(child.id)
        node = await session.get(TaskProfileItem, node_id)
        if node:
            await session.delete(node)
            await session.flush()

    await _delete_subtree(item_id)


# ---------------------------------------------------------------------------
# Apply profile → create task tree
# ---------------------------------------------------------------------------

@router.post("/{profile_id}/apply", response_model=list[dict], status_code=status.HTTP_201_CREATED)
async def apply_profile(
    profile_id: uuid.UUID,
    body: ApplyProfileRequest,
    session: AsyncSessionDep,
    current_user: User = Depends(require_permission("TASK_CREATE")),
) -> list[dict]:
    """
    Apply a TaskProfile to a project, creating a full task tree.
    start_time / end_time are set as placeholders; child end_time is clamped
    to parent end_time to keep timeline consistent.
    """
    profile = await _get_profile_or_404(session, profile_id)

    # Load all items sorted by level then order_index
    items_result = await session.execute(
        select(TaskProfileItem)
        .where(TaskProfileItem.profile_id == profile_id)
        .order_by(TaskProfileItem.level, TaskProfileItem.order_index)
    )
    items = list(items_result.scalars().all())
    if not items:
        raise HTTPException(422, "Mẫu công việc không có nội dung.")

    # Validate level consistency vs parent_item_id chain inside the profile.
    items_by_id = {i.id: i for i in items}
    for it in items:
        if it.parent_item_id is None:
            if it.level != 0:
                raise HTTPException(422, f"Mục '{it.name}' không có cha nhưng level != 0.")
        else:
            parent_it = items_by_id.get(it.parent_item_id)
            if parent_it is None:
                raise HTTPException(422, f"Mục '{it.name}' tham chiếu cha không tồn tại.")
            if it.level != parent_it.level + 1:
                raise HTTPException(422, f"Mục '{it.name}' có level không khớp với cha.")

    # Validate level if attaching to parent task
    base_level = 0
    parent_task: Task | None = None
    if body.parent_task_id:
        parent_result = await session.execute(select(Task).where(Task.id == body.parent_task_id))
        parent_task = parent_result.scalars().first()
        if not parent_task:
            raise HTTPException(404, "Không tìm thấy task cha.")
        if parent_task.is_deleted:
            raise HTTPException(422, "Task cha đã bị xóa.")
        if parent_task.status == "done":
            raise HTTPException(422, "Không thể áp dụng mẫu vào task cha đã hoàn thành.")
        base_level = parent_task.level + 1
        max_item_level = max(i.level for i in items)
        if base_level + max_item_level > 4:
            raise HTTPException(422, "Áp dụng mẫu này sẽ vượt quá 5 tầng.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Map: profile_item.id → (newly created Task.id, end_time)
    item_to_task: dict[uuid.UUID, uuid.UUID] = {}
    created_tasks: list[tuple[Task, "TaskProfileItem"]] = []
    task_end_by_item: dict[uuid.UUID, datetime] = {}

    # Process strictly by level so a child's parent task always exists when it is created.
    for item in sorted(items, key=lambda x: (x.level, x.order_index, str(x.id))):
        actual_level = base_level + item.level
        parent_task_id: uuid.UUID | None = None
        parent_end: datetime | None = None
        parent_start: datetime | None = None

        if item.parent_item_id:
            parent_task_id = item_to_task.get(item.parent_item_id)
            if parent_task_id is None:
                # Defensive: validation above should prevent this.
                raise HTTPException(422, f"Mục '{item.name}' tham chiếu cha chưa được tạo.")
            parent_end = task_end_by_item.get(item.parent_item_id)
            parent_start = now
        elif body.parent_task_id and parent_task is not None:
            parent_task_id = body.parent_task_id
            parent_end = parent_task.end_time
            parent_start = parent_task.start_time

        start_time = parent_start if parent_start is not None else now
        end_time = datetime.fromtimestamp(
            start_time.timestamp() + item.duration_days * 86400
        ).replace(tzinfo=None)
        # Clamp child to parent's end_time so timeline remains valid.
        if parent_end is not None and end_time > parent_end.replace(tzinfo=None):
            end_time = parent_end.replace(tzinfo=None)
        if end_time <= start_time:
            # At minimum 1 second window to satisfy `end > start` invariant.
            end_time = datetime.fromtimestamp(start_time.timestamp() + 1).replace(tzinfo=None)

        task = Task(
            project_id=body.project_id,
            parent_id=parent_task_id,
            level=actual_level,
            name=item.name,
            description=item.description,
            start_time=start_time,
            end_time=end_time,
            assignor_id=current_user.id,
            assignee_id=body.assignee_id,
            module_tag=item.module_tag,
            color=item.color,
            status="todo",
        )
        session.add(task)
        await session.flush()
        item_to_task[item.id] = task.id
        task_end_by_item[item.id] = end_time
        created_tasks.append((task, item))

        # Attach extra assignees (dedup, skip primary).
        for extra_id in dict.fromkeys(body.extra_assignee_ids or []):
            if extra_id == body.assignee_id:
                continue
            session.add(
                TaskAssignee(
                    task_id=task.id,
                    user_id=extra_id,
                    assigned_by=current_user.id,
                )
            )
        await session.flush()

    # Recompute critical path so Gantt stays in sync with newly created tasks.
    try:
        svc = TaskService(session)
        await svc.recalculate_critical_path(body.project_id)
    except Exception:
        # Non-fatal: tasks are already persisted; CPM will recompute on next mutation.
        pass

    return [
        {"id": str(t.id), "name": t.name, "level": t.level,
         "parent_id": str(t.parent_id) if t.parent_id else None,
         "order_index": itm.order_index}
        for t, itm in created_tasks
    ]


# ---------------------------------------------------------------------------
# Save existing task subtree as profile
# ---------------------------------------------------------------------------

@router.post("/from-task/{task_id}", response_model=TaskProfilePublic, status_code=status.HTTP_201_CREATED)
async def save_task_as_profile(
    task_id: uuid.UUID,
    body: SaveAsProfileRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> TaskProfilePublic:
    """Save a task and its entire subtree as a reusable TaskProfile."""
    subtree = await _collect_subtree(session, task_id)
    if not subtree:
        raise HTTPException(404, "Không tìm thấy task.")

    root = next(t for t in subtree if t.id == task_id)
    if root.level != 0:
        raise HTTPException(422, "Chỉ Hạng mục (tầng 0) mới được lưu làm mẫu.")
    root_level = root.level

    # Fallback: if client didn't pass company_id, infer from the task's project
    inferred_company_id = body.company_id
    if inferred_company_id is None and root.project_id is not None:
        from app.models.project import Project

        proj = await session.get(Project, root.project_id)
        if proj is not None:
            inferred_company_id = getattr(proj, "company_id", None)

    profile = TaskProfile(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
        company_id=inferred_company_id,
    )
    session.add(profile)
    await session.flush()

    # Map original task.id → new TaskProfileItem.id
    task_to_item: dict[uuid.UUID, uuid.UUID] = {}

    for task in sorted(subtree, key=lambda t: (t.level, t.start_time)):
        parent_item_id = None
        if task.parent_id and task.parent_id in task_to_item:
            parent_item_id = task_to_item[task.parent_id]

        duration_days = max(1, (task.end_time - task.start_time).days)

        item = TaskProfileItem(
            profile_id=profile.id,
            parent_item_id=parent_item_id,
            name=task.name,
            level=task.level - root_level,
            duration_days=duration_days,
            order_index=0,
            description=task.description,
            module_tag=task.module_tag,
            color=task.color,
        )
        session.add(item)
        await session.flush()
        task_to_item[task.id] = item.id

    return await _build_profile_public(session, profile)
