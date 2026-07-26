"""
Seed dự án đa dạng để test view Gantt "Tổng quan dự án" (ProjectTimeline).

Mục tiêu là ép ra đủ các trường hợp biên mà view phải xử lý: bar rất hẹp (nhãn
phải tự ẩn), dự án dài vắt qua nhiều tháng, dự án nằm hoàn toàn trong quá khứ /
tương lai, mọi status (để kiểm màu + include_finished), tên dài (ellipsis cột
nhãn), và progress ở cả 3 nhánh của công thức WBS rollup.

Idempotent: nhận diện dự án đã seed qua prefix code TLD-, chạy lại không nhân bản.

Usage:
    python -m app.scripts.seed_timeline_demo                 # công ty đầu tiên
    python -m app.scripts.seed_timeline_demo --slug saree-poc
    python -m app.scripts.seed_timeline_demo --wipe          # xoá data seed cũ rồi tạo lại
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, delete, select

from app.core.db import engine
from app.models.org import Company
from app.models.project import Project
from app.models.task import Task, TaskProgressReport
from app.models.user import User

CODE_PREFIX = "TLD-"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def dt(d: date) -> datetime:
    """Naive UTC midnight — task.start_time/end_time are TIMESTAMP WITHOUT TZ."""
    return datetime(d.year, d.month, d.day)


# (code_suffix, name, start_offset_days, duration_days, status, task_plan)
#
# task_plan mô tả tiến độ để rollup ra số mong đợi:
#   []                          -> không có task, progress = 0
#   [(weight|None, percent)]    -> task gốc, weight = % của dự án
#   ("nested", ...)             -> cây 2 cấp, để chạy nhánh có con của công thức
PROJECT_PLAN: list[tuple[str, str, int, int, str, list]] = [
    # Đang chạy, vắt qua hôm nay — trường hợp thường gặp nhất
    (
        "001",
        "Lắp đặt kho lạnh Đồng Nai",
        -20,
        50,
        "active",
        [(60, 100), (40, 50)],  # -> 80%
    ),
    # Bar rất hẹp: 2 ngày. Ở scale tuần 80px ≈ 23px -> mọi nhãn phải tự ẩn
    ("002", "Sửa băng tải IQF", -1, 2, "active", [(None, 45)]),
    # Đúng 1 ngày: start == end, bar phải là chiều rộng tối thiểu, không âm
    ("003", "Kiểm định áp lực bình chứa", 3, 1, "planning", []),
    # Dự án dài 8 tháng — kéo giãn trục, kiểm scroll ngang
    (
        "004",
        "Tổng thầu nhà máy chế biến Long An giai đoạn 2",
        -90,
        240,
        "active",
        [("nested", 30), (None, 10)],
    ),
    # Nằm hoàn toàn trong quá khứ nhưng chưa xong -> bar bên trái needle
    ("005", "Bảo trì hệ thống điện Bình Dương", -75, 30, "on_hold", [(None, 70)]),
    # Nằm hoàn toàn ở tương lai, chưa có tiến độ
    ("006", "Mở rộng dây chuyền cấp đông Tiền Giang", 45, 60, "planning", []),
    # Tên rất dài — ép ellipsis ở cột nhãn và tooltip
    (
        "007",
        "Thi công hệ thống lạnh trung tâm kèm cải tạo nhà xưởng và hạ tầng điện "
        "nước cho Công ty TNHH Thực phẩm Xuất khẩu Miền Nam — hạng mục mở rộng",
        -10,
        75,
        "active",
        [(None, 25)],
    ),
    # 100% nhưng vẫn active — fill phải phủ kín bar
    ("008", "Thay vỏ cách nhiệt kho mát", -30, 25, "active", [(None, 100)]),
    # Các status còn lại: chỉ hiện khi include_finished=true
    ("009", "Lắp đặt kho lạnh Cần Thơ (đã xong)", -120, 60, "completed", [(None, 100)]),
    ("010", "Dự án đã huỷ — kho lạnh Vĩnh Long", -60, 40, "cancelled", [(None, 15)]),
]


def pick_company(session: Session, slug: str | None) -> Company:
    if slug:
        company = session.exec(select(Company).where(Company.slug == slug)).first()
        if not company:
            raise SystemExit(f"Không tìm thấy company slug={slug!r}")
        return company
    company = session.exec(select(Company)).first()
    if not company:
        raise SystemExit("DB chưa có company nào — chạy seed_defaults trước.")
    return company


def pick_user(session: Session, company: Company) -> User:
    """Any user in the company, to own the projects/tasks."""
    user = session.exec(select(User).where(User.company_id == company.id)).first()
    if user:
        return user
    user = session.exec(select(User)).first()
    if not user:
        raise SystemExit("DB chưa có user nào — chạy seed_defaults trước.")
    return user


def wipe(session: Session, company: Company) -> int:
    """Delete every previously seeded project (and its tasks/reports)."""
    projects = session.exec(
        select(Project).where(
            Project.company_id == company.id,
            Project.code.startswith(CODE_PREFIX),  # type: ignore[attr-defined]
        )
    ).all()
    if not projects:
        return 0
    project_ids = [p.id for p in projects]
    task_ids = session.exec(
        select(Task.id).where(Task.project_id.in_(project_ids))  # type: ignore[attr-defined]
    ).all()
    if task_ids:
        session.exec(
            delete(TaskProgressReport).where(
                TaskProgressReport.task_id.in_(task_ids)  # type: ignore[attr-defined]
            )
        )
        # Children first so the self-referencing parent_id FK stays satisfied.
        session.exec(
            delete(Task).where(
                Task.project_id.in_(project_ids),  # type: ignore[attr-defined]
                Task.parent_id.is_not(None),  # type: ignore[union-attr]
            )
        )
        session.exec(
            delete(Task).where(Task.project_id.in_(project_ids))  # type: ignore[attr-defined]
        )
    for p in projects:
        session.delete(p)
    session.commit()
    return len(projects)


def add_task(
    session: Session,
    *,
    project: Project,
    user: User,
    name: str,
    weight: int | None,
    percent: int,
    parent: Task | None = None,
) -> Task:
    """Create a task plus one APPROVED progress report (only approved counts)."""
    task = Task(
        project_id=project.id,
        parent_id=parent.id if parent else None,
        level=(parent.level + 1) if parent else 0,
        name=name,
        start_time=dt(project.start_date),
        end_time=dt(project.end_date),
        status="done" if percent >= 100 else "in_progress",
        assignor_id=user.id,
        assignee_id=user.id,
        progress_weight=weight,
    )
    session.add(task)
    session.flush()

    if percent > 0:
        session.add(
            TaskProgressReport(
                task_id=task.id,
                reporter_id=user.id,
                photo_url="https://placehold.co/600x400?text=seed",
                progress_percent=percent,
                note="seed timeline demo",
                review_status="approved",
                reviewer_id=user.id,
                reviewed_at=now_utc(),
            )
        )
    return task


def seed(session: Session, slug: str | None, do_wipe: bool) -> None:
    company = pick_company(session, slug)
    user = pick_user(session, company)
    print(f"  Company : {company.name} ({company.slug})")
    print(f"  Owner   : {user.email}")

    if do_wipe:
        n = wipe(session, company)
        print(f"  Đã xoá {n} dự án seed cũ")

    today = date.today()
    created = 0
    skipped = 0

    for suffix, name, start_off, duration, status, task_plan in PROJECT_PLAN:
        code = f"{CODE_PREFIX}{suffix}"
        existing = session.exec(
            select(Project).where(
                Project.company_id == company.id, Project.code == code
            )
        ).first()
        if existing:
            skipped += 1
            continue

        start = today + timedelta(days=start_off)
        project = Project(
            company_id=company.id,
            name=name,
            code=code,
            description="Seed để test view Gantt tổng quan dự án.",
            start_date=start,
            end_date=start + timedelta(days=duration - 1),
            status=status,
            project_type="client",
            pm_id=user.id,
            created_by=user.id,
        )
        session.add(project)
        session.flush()

        for i, item in enumerate(task_plan, start=1):
            if item[0] == "nested":
                # Parent with children: exercises the branch of the rollup formula
                # where child weights and the parent's own reports both contribute.
                _, child_pct = item
                parent = add_task(
                    session,
                    project=project,
                    user=user,
                    name=f"Hạng mục {i}",
                    weight=None,
                    percent=0,
                )
                add_task(
                    session,
                    project=project,
                    user=user,
                    name=f"Việc {i}.1",
                    weight=50,
                    percent=child_pct,
                    parent=parent,
                )
                add_task(
                    session,
                    project=project,
                    user=user,
                    name=f"Việc {i}.2",
                    weight=50,
                    percent=0,
                    parent=parent,
                )
            else:
                weight, percent = item
                add_task(
                    session,
                    project=project,
                    user=user,
                    name=f"Công việc {i}",
                    weight=weight,
                    percent=percent,
                )

        created += 1
        print(f"  + {code}  {start} → {project.end_date}  [{status}]")

    session.commit()
    print(f"\n  Tạo mới: {created} · Bỏ qua (đã có): {skipped}")
    print("  Xem tại: Dashboard → 'Tiến độ dự án (Gantt)', hoặc /gantt tab Tổng quan")
    print("  Dự án completed/cancelled chỉ hiện khi include_finished=true")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", default=None, help="Company slug (mặc định: đầu tiên)")
    parser.add_argument(
        "--wipe", action="store_true", help=f"Xoá dự án {CODE_PREFIX}* rồi tạo lại"
    )
    args = parser.parse_args()

    print("🌱 Seed timeline demo projects")
    with Session(engine) as session:
        try:
            seed(session, args.slug, args.wipe)
        except SystemExit:
            raise
        except Exception as exc:
            print(f"\n❌ Lỗi: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
