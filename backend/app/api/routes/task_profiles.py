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
    await session.delete(item)
    await session.flush()


# ---------------------------------------------------------------------------
# Apply profile → create task tree
# ---------------------------------------------------------------------------

@router.post("/{profile_id}/apply", response_model=list[dict], status_code=status.HTTP_201_CREATED)
async def apply_profile(
    profile_id: uuid.UUID,
    body: ApplyProfileRequest,
    session: AsyncSessionDep,
    current_user: CurrentUser,
) -> list[dict]:
    """
    Apply a TaskProfile to a project, creating a full task tree.
    start_time / end_time are set as placeholders (today + duration_days);
    user adjusts after creation.
    """
    profile = await _get_profile_or_404(session, profile_id)

    # Load all items sorted by level then order_index
    items_result = await session.execute(
        select(TaskProfileItem)
        .where(TaskProfileItem.profile_id == profile_id)
        .order_by(TaskProfileItem.level, TaskProfileItem.order_index)
    )
    items = items_result.scalars().all()
    if not items:
        raise HTTPException(422, "Mẫu công việc không có nội dung.")

    # Validate level if attaching to parent task
    base_level = 0
    if body.parent_task_id:
        parent_result = await session.execute(select(Task).where(Task.id == body.parent_task_id))
        parent_task = parent_result.scalars().first()
        if not parent_task:
            raise HTTPException(404, "Không tìm thấy task cha.")
        base_level = parent_task.level + 1
        root_items = [i for i in items if i.parent_item_id is None]
        max_item_level = max(i.level for i in items)
        if base_level + max_item_level > 4:
            raise HTTPException(422, "Áp dụng mẫu này sẽ vượt quá 5 tầng.")

    now = datetime.now(timezone.utc)

    # Map: profile_item.id → newly created Task.id
    item_to_task: dict[uuid.UUID, uuid.UUID] = {}
    created_tasks: list[Task] = []

    for item in sorted(items, key=lambda x: (x.level, x.order_index)):
        actual_level = base_level + item.level
        parent_task_id: uuid.UUID | None = None
        if item.parent_item_id:
            parent_task_id = item_to_task.get(item.parent_item_id)
        elif body.parent_task_id:
            parent_task_id = body.parent_task_id

        end_time = datetime.fromtimestamp(
            now.timestamp() + item.duration_days * 86400, tz=timezone.utc
        )

        task = Task(
            project_id=body.project_id,
            parent_id=parent_task_id,
            level=actual_level,
            name=item.name,
            description=item.description,
            start_time=now,
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
        created_tasks.append(task)

    return [{"id": str(t.id), "name": t.name, "level": t.level} for t in created_tasks]


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
    root_level = root.level

    profile = TaskProfile(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
        company_id=body.company_id,
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
