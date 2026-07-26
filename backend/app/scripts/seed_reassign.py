"""
Reassign tasks để trải đều nhân viên vào các công trình đang thi công.
Chạy sau seed_full_demo. Idempotent.

Usage:
    uv run python -m app.scripts.seed_reassign
"""
from __future__ import annotations

import sys
from datetime import timedelta, timezone, datetime

from sqlmodel import Session, select

from app.core.db import engine
from app.models.org import Company
from app.models.project import Project
from app.models.task import Task, TaskAssignee
from app.models.user import User

POC_COMPANY_SLUG = "saree-poc"


def now_utc():
    return datetime.now(timezone.utc)


def upsert_assignee(session: Session, task_id, user_id, assigned_by_id) -> None:
    exists = session.exec(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task_id,
            TaskAssignee.user_id == user_id,
        )
    ).first()
    if not exists:
        session.add(TaskAssignee(task_id=task_id, user_id=user_id, assigned_by=assigned_by_id))


def main() -> None:
    with Session(engine) as session:
        company = session.exec(select(Company).where(Company.slug == POC_COMPANY_SLUG)).first()
        if not company:
            print("❌ Không tìm thấy company POC.", file=sys.stderr)
            sys.exit(1)

        users_by_email: dict[str, User] = {
            u.email: u for u in session.exec(
                select(User).where(User.company_id == company.id)
            ).all()
        }

        def u(email: str) -> User | None:
            return users_by_email.get(email)

        director = u("gd@saree.demo")
        assignor_id = director.id if director else None

        projects: dict[str, Project] = {
            p.code: p for p in session.exec(
                select(Project).where(Project.company_id == company.id)
            ).all()
        }

        t0 = now_utc()

        # ── SAR-002: Kho lạnh Cần Giờ ───────────────────────────────────────
        proj = projects.get("SAR-002")
        if proj:
            tasks = session.exec(
                select(Task).where(Task.project_id == proj.id, Task.level == 1)
            ).all()
            task_map = {t.name: t for t in tasks}

            t = task_map.get("Lắp dàn bay hơi kho lạnh")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("binh@saree.demo").id if u("binh@saree.demo") else t.assignee_id
                t.required_headcount = 4
                for email in ["binh@saree.demo", "hung@saree.demo", "duc@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

            t = task_map.get("Bọc cách nhiệt đường ống")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("lan@saree.demo").id if u("lan@saree.demo") else t.assignee_id
                t.required_headcount = 3
                for email in ["lan@saree.demo", "hoa@saree.demo", "son@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

        # ── SAR-003: IQF Bình Dương ──────────────────────────────────────────
        proj = projects.get("SAR-003")
        if proj:
            tasks = session.exec(
                select(Task).where(Task.project_id == proj.id, Task.level == 1)
            ).all()
            task_map = {t.name: t for t in tasks}

            t = task_map.get("Lắp đặt đường hầm đông IQF")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("nhung@saree.demo").id if u("nhung@saree.demo") else t.assignee_id
                t.required_headcount = 5
                for email in ["nhung@saree.demo", "lan@saree.demo", "hoa@saree.demo", "mai@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

            t = task_map.get("Đấu nối điện tủ điều khiển")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("thang@saree.demo").id if u("thang@saree.demo") else t.assignee_id
                t.required_headcount = 3
                for email in ["thang@saree.demo", "khoa@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

        # ── SAR-004: Máy nén Long An ─────────────────────────────────────────
        proj = projects.get("SAR-004")
        if proj:
            tasks = session.exec(
                select(Task).where(Task.project_id == proj.id, Task.level == 1)
            ).all()
            task_map = {t.name: t for t in tasks}

            t = task_map.get("Lắp máy nén mới")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("tuan@saree.demo").id if u("tuan@saree.demo") else t.assignee_id
                t.required_headcount = 3
                for email in ["tuan@saree.demo", "binh@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

        # ── SAR-005: Điện Đồng Nai ───────────────────────────────────────────
        proj = projects.get("SAR-005")
        if proj:
            tasks = session.exec(
                select(Task).where(Task.project_id == proj.id, Task.level == 1)
            ).all()
            task_map = {t.name: t for t in tasks}

            t = task_map.get("Nghiệm thu & bàn giao")
            if t:
                t.status = "in_progress"
                t.assignee_id = u("thang@saree.demo").id if u("thang@saree.demo") else t.assignee_id
                t.required_headcount = 2
                for email in ["cuong@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

        # ── POC-001: Kho lạnh ABC ─────────────────────────────────────────────
        proj = projects.get("POC-001")
        if proj:
            tasks = session.exec(
                select(Task).where(Task.project_id == proj.id, Task.level == 1)
            ).all()
            task_map = {t.name: t for t in tasks}

            t = task_map.get("Lắp đường ống lạnh")
            if t:
                t.required_headcount = 3
                for email in ["tho.han@saree.demo", "duc@saree.demo"]:
                    if u(email) and assignor_id:
                        upsert_assignee(session, t.id, u(email).id, assignor_id)

        session.commit()

        # Summary
        total_tasks = session.exec(
            select(Task).where(
                Task.project_id.in_([p.id for p in projects.values()]),
                Task.status == "in_progress",
                Task.level == 1,
            )
        ).all()
        total_assignees = session.exec(select(TaskAssignee)).all()

        print("✅ Reassign hoàn tất!")
        print(f"   Tasks in_progress: {len(total_tasks)}")
        print(f"   Tổng TaskAssignee rows: {len(total_assignees)}")


if __name__ == "__main__":
    main()
