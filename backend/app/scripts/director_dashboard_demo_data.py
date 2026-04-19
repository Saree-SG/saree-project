"""Legacy seed/export for director dashboard (slug ``default``).

Prefer a full process-aligned demo via:

  uv run python -m app.scripts.reset_saree_process_demo --confirm

That script wipes tenant tables and seeds ``Công ty Saree`` (slug ``saree``) with
roles/tasks from Quy trình Sản xuất. This module remains for optional JSON
export/import against the ``default`` company if you recreate it manually.
"""

from __future__ import annotations

import argparse
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, SQLModel, select

from app import crud
from app.core.db import engine
from app.models.org import (
    Company,
    Department,
    Permission,
    ProjectMemberRole,
    Role,
    UserCompanyRole,
)
from app.models.project import Project
from app.models.task import (
    AuditLog,
    Task,
    TaskComment,
    TaskDependency,
    TaskProgressReport,
    TaskProof,
)
from app.models.user import User, UserCreate
from app.scripts.seed_defaults import seed as seed_defaults_roles

DEFAULT_EXPORT_PATH = Path("demo/director_dashboard_data.json")


def now_utc() -> datetime:
    """Return timezone-aware current UTC timestamp."""

    return datetime.now(timezone.utc)


def get_or_create_default_company(session: Session) -> Company:
    """Return default company, creating it if missing."""

    company = session.exec(select(Company).where(Company.slug == "default")).first()
    if company is not None:
        return company
    company = Company(name="Default Company", slug="default")
    session.add(company)
    session.commit()
    session.refresh(company)
    return company


def get_or_create_demo_user(session: Session, email: str, full_name: str) -> User:
    """Return existing user by email or create a new active user."""

    user = session.exec(select(User).where(User.email == email)).first()
    if user is not None:
        return user
    created = crud.create_user(
        session=session,
        user_create=UserCreate(
            email=email,
            password="demo12345",
            is_active=True,
            is_superuser=False,
            full_name=full_name,
        ),
    )
    return created


def assign_company_role(
    session: Session,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    role_id: uuid.UUID,
    is_primary: bool,
) -> None:
    """Assign a company role to user if not already assigned."""

    existing = session.exec(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
            UserCompanyRole.role_id == role_id,
        )
    ).first()
    if existing is None:
        session.add(
            UserCompanyRole(
                user_id=user_id,
                company_id=company_id,
                role_id=role_id,
                is_primary=is_primary,
            )
        )


def _seed_partner_worker_tasks(session: Session, director_user: User, nam_user: User) -> int:
    """Create a second company with a project and open tasks assigned to Nam for my-tasks UI testing."""

    partner = session.exec(select(Company).where(Company.slug == "demo-partner")).first()
    if partner is None:
        partner = Company(name="Saree Partner (Demo)", slug="demo-partner")
        session.add(partner)
        session.commit()
        session.refresh(partner)
        seed_defaults_roles(session, partner.id)
        session.commit()

    director_r = session.exec(
        select(Role).where(Role.company_id == partner.id, Role.name == "director")
    ).first()
    worker_r = session.exec(
        select(Role).where(Role.company_id == partner.id, Role.name == "worker")
    ).first()
    if director_r is None or worker_r is None:
        return 0

    assign_company_role(session, director_user.id, partner.id, director_r.id, False)
    assign_company_role(session, nam_user.id, partner.id, worker_r.id, False)
    session.commit()

    dept = session.exec(select(Department).where(Department.company_id == partner.id)).first()
    department_id = dept.id if dept else None

    project = session.exec(
        select(Project).where(
            Project.company_id == partner.id,
            Project.code == "DEMO-PART-001",
            Project.is_deleted == False,  # noqa
        )
    ).first()
    if project is None:
        today = date.today()
        project = Project(
            company_id=partner.id,
            department_id=department_id,
            name="Gò Vấp - Kho trạm cell",
            code="DEMO-PART-001",
            description="Demo cross-company tasks for worker.nam@saree.demo",
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=90),
            status="active",
            pm_id=director_user.id,
            created_by=director_user.id,
        )
        session.add(project)
        session.flush()

    existing_members = session.exec(
        select(ProjectMemberRole).where(ProjectMemberRole.project_id == project.id)
    ).all()
    member_ids = {member.user_id for member in existing_members}
    if director_user.id not in member_ids:
        session.add(
            ProjectMemberRole(
                project_id=project.id,
                user_id=director_user.id,
                role_id=director_r.id,
            )
        )
    if nam_user.id not in member_ids:
        session.add(
            ProjectMemberRole(project_id=project.id, user_id=nam_user.id, role_id=worker_r.id)
        )
    session.commit()

    open_specs: list[tuple[str, timedelta]] = [
        ("in_progress", timedelta(days=-1)),
        ("todo", timedelta(days=2)),
        ("todo", timedelta(days=5)),
        ("in_progress", timedelta(days=-3)),
        ("review", timedelta(days=0)),
    ]
    created = 0
    now = now_utc()
    for index, (status, end_delta) in enumerate(open_specs):
        name = f"Partner site task #{index + 1}"
        exists = session.exec(
            select(Task).where(
                Task.project_id == project.id,
                Task.name == name,
                Task.is_deleted == False,  # noqa
            )
        ).first()
        if exists is not None:
            continue
        start_time = now - timedelta(days=5 + index)
        end_time = now + end_delta
        task = Task(
            project_id=project.id,
            parent_id=None,
            level=0,
            name=name,
            description=f"Cross-company demo — {partner.name}",
            priority="medium",
            start_time=start_time,
            end_time=end_time,
            status=status,
            assignor_id=director_user.id,
            assignee_id=nam_user.id,
            actual_end_time=None,
            is_on_critical_path=False,
        )
        session.add(task)
        created += 1
    session.commit()
    return created


def seed_demo_data(session: Session) -> dict[str, Any]:
    """Seed deterministic demo data for director dashboard metrics."""

    random.seed(42)
    company = get_or_create_default_company(session)
    seed_defaults_roles(session, company.id)

    director_role = session.exec(
        select(Role).where(Role.company_id == company.id, Role.name == "director")
    ).first()
    worker_role = session.exec(
        select(Role).where(Role.company_id == company.id, Role.name == "worker")
    ).first()
    if director_role is None or worker_role is None:
        raise RuntimeError("Default roles are missing. Run seed_defaults first.")

    users_seed = [
        ("director.demo@saree.demo", "Director Demo"),
        ("worker.nam@saree.demo", "Le Van Nam"),
        ("worker.tu@saree.demo", "Tran Minh Tu"),
        ("worker.linh@saree.demo", "Pham My Linh"),
        ("worker.anh@saree.demo", "Nguyen Van Anh"),
    ]
    users: list[User] = []
    for email, name in users_seed:
        user = get_or_create_demo_user(session, email, name)
        if user.company_id != company.id:
            user.company_id = company.id
            session.add(user)
        users.append(user)
    session.commit()

    director_user = users[0]
    worker_users = users[1:]
    assign_company_role(session, director_user.id, company.id, director_role.id, True)
    for worker in worker_users:
        assign_company_role(session, worker.id, company.id, worker_role.id, True)
    session.commit()

    departments = session.exec(select(Department).where(Department.company_id == company.id)).all()
    department_id = departments[0].id if departments else None

    existing_projects = session.exec(
        select(Project).where(
            Project.company_id == company.id,
            Project.code.in_(["DEMO-PRJ-001", "DEMO-PRJ-002", "DEMO-PRJ-003"]),  # type: ignore[arg-type]
            Project.is_deleted == False,  # noqa
        )
    ).all()
    project_by_code = {project.code: project for project in existing_projects}

    project_specs = [
        ("DEMO-PRJ-001", "Vinhomes Grand Park - Khu 5", "active"),
        ("DEMO-PRJ-002", "Landmark 81 - Cai tao sanh", "active"),
        ("DEMO-PRJ-003", "Bitexco Tower - Tang 22", "planning"),
    ]
    today = date.today()
    projects: list[Project] = []
    for index, (code, name, status) in enumerate(project_specs):
        existing = project_by_code.get(code)
        if existing is not None:
            projects.append(existing)
            continue
        project = Project(
            company_id=company.id,
            department_id=department_id,
            name=name,
            code=code,
            description=f"Demo project for dashboard #{index + 1}",
            start_date=today - timedelta(days=20 + index * 5),
            end_date=today + timedelta(days=45 + index * 10),
            status=status,
            pm_id=director_user.id,
            created_by=director_user.id,
        )
        session.add(project)
        session.flush()
        projects.append(project)

    for project in projects:
        existing_members = session.exec(
            select(ProjectMemberRole).where(ProjectMemberRole.project_id == project.id)
        ).all()
        existing_member_user_ids = {member.user_id for member in existing_members}
        if director_user.id not in existing_member_user_ids:
            session.add(
                ProjectMemberRole(project_id=project.id, user_id=director_user.id, role_id=director_role.id)
            )
        for worker in worker_users:
            if worker.id not in existing_member_user_ids:
                session.add(
                    ProjectMemberRole(project_id=project.id, user_id=worker.id, role_id=worker_role.id)
                )
    session.commit()

    task_names = [
        "Lap dat he thong HVAC",
        "Son hoan thien sanh chinh",
        "Hoan tat he thong den",
        "Nghiem thu vat lieu",
        "Ban giao khu vuc",
        "Kiem dinh an toan",
    ]
    now = now_utc()
    created_tasks = 0
    for project_index, project in enumerate(projects):
        existing_task_count = session.exec(
            select(Task).where(Task.project_id == project.id, Task.is_deleted == False)  # noqa
        ).all()
        if len(existing_task_count) >= 12:
            continue
        for task_index in range(12):
            assignee = worker_users[(project_index + task_index) % len(worker_users)]
            start_time = now - timedelta(days=15 - task_index)
            end_time = start_time + timedelta(days=3 + (task_index % 4))
            if task_index % 5 == 0:
                status = "done"
                actual_end = end_time - timedelta(hours=6)
            elif task_index % 5 == 1:
                status = "done"
                actual_end = end_time + timedelta(hours=8)
            elif task_index % 5 == 2:
                status = "in_progress"
                actual_end = None
                end_time = now - timedelta(days=2)
            elif task_index % 5 == 3:
                status = "review"
                actual_end = None
            else:
                status = "todo"
                actual_end = None
            task = Task(
                project_id=project.id,
                parent_id=None,
                level=0,
                name=f"{task_names[task_index % len(task_names)]} #{task_index + 1}",
                description=f"Demo task for {project.name}",
                priority=["low", "medium", "high", "critical"][task_index % 4],
                start_time=start_time,
                end_time=end_time,
                status=status,
                assignor_id=director_user.id,
                assignee_id=assignee.id,
                actual_end_time=actual_end,
                is_on_critical_path=(task_index % 4 == 0),
            )
            session.add(task)
            session.flush()
            created_tasks += 1

            demo_photo = f"https://picsum.photos/seed/{task.id}/400/300"
            if task.status == "done":
                session.add(
                    TaskProgressReport(
                        task_id=task.id,
                        reporter_id=assignee.id,
                        photo_url=demo_photo,
                        progress_percent=55,
                        note="Báo cáo tiến độ đợt 1",
                    )
                )
                session.add(
                    TaskProgressReport(
                        task_id=task.id,
                        reporter_id=assignee.id,
                        photo_url=f"https://picsum.photos/seed/{task.id}-b/400/300",
                        progress_percent=45,
                        note="Hoàn tất",
                    )
                )
            elif task.status == "in_progress":
                session.add(
                    TaskProgressReport(
                        task_id=task.id,
                        reporter_id=assignee.id,
                        photo_url=demo_photo,
                        progress_percent=40,
                        note="Đang thi công",
                    )
                )

            comment = TaskComment(
                task_id=task.id,
                author_id=assignee.id,
                content="Demo progress update",
                comment_type="progress_report",
            )
            session.add(comment)

            if task.status == "done":
                proof = TaskProof(
                    task_id=task.id,
                    uploader_id=assignee.id,
                    file_url=f"https://demo.local/proofs/{task.id}.jpg",
                    file_type="image",
                    note="Demo completion proof",
                    review_status="approved",
                    reviewer_id=director_user.id,
                    reviewed_at=now,
                )
                session.add(proof)

            audit = AuditLog(
                actor_id=director_user.id,
                action="task.created",
                entity_type="task",
                entity_id=task.id,
                old_value=None,
                new_value={"status": task.status, "project_id": str(project.id)},
            )
            session.add(audit)

    session.commit()

    all_tasks = session.exec(
        select(Task).where(Task.project_id.in_([project.id for project in projects]))  # type: ignore[arg-type]
    ).all()
    for index in range(1, min(len(all_tasks), 15)):
        current_task = all_tasks[index]
        previous_task = all_tasks[index - 1]
        existing_dep = session.exec(
            select(TaskDependency).where(
                TaskDependency.blocking_task_id == previous_task.id,
                TaskDependency.dependent_task_id == current_task.id,
            )
        ).first()
        if existing_dep is None:
            session.add(
                TaskDependency(
                    blocking_task_id=previous_task.id,
                    dependent_task_id=current_task.id,
                    dependency_type="FS",
                    lag_hours=0,
                )
            )
    session.commit()

    partner_tasks_created = _seed_partner_worker_tasks(session, director_user, worker_users[0])

    return {
        "company_id": str(company.id),
        "projects_seeded": len(projects),
        "users_seeded": len(users),
        "tasks_created": created_tasks,
        "partner_tasks_created": partner_tasks_created,
    }


def model_to_dict(model: SQLModel) -> dict[str, Any]:
    """Serialize SQLModel instance to JSON-safe dictionary."""

    return model.model_dump(mode="json")


def export_demo_data(session: Session, output_path: Path) -> dict[str, Any]:
    """
    Export company-scoped demo data into a JSON bundle.

    Bundle matches the ``default`` slug company only; after ``reset_saree_process_demo``
    the primary tenant is ``saree`` — re-export from that company if you extend this helper.
    """

    company = get_or_create_default_company(session)
    project_ids = session.exec(select(Project.id).where(Project.company_id == company.id)).all()
    users = session.exec(select(User).where(User.company_id == company.id)).all()
    roles = session.exec(select(Role).where(Role.company_id == company.id)).all()
    departments = session.exec(select(Department).where(Department.company_id == company.id)).all()
    user_company_roles = session.exec(
        select(UserCompanyRole).where(UserCompanyRole.company_id == company.id)
    ).all()
    projects = session.exec(select(Project).where(Project.company_id == company.id)).all()
    project_member_roles = session.exec(
        select(ProjectMemberRole).where(ProjectMemberRole.project_id.in_(project_ids))  # type: ignore[arg-type]
    ).all()
    tasks = session.exec(
        select(Task).where(Task.project_id.in_(project_ids))  # type: ignore[arg-type]
    ).all()
    task_ids = [task.id for task in tasks]
    task_comments = session.exec(
        select(TaskComment).where(TaskComment.task_id.in_(task_ids))  # type: ignore[arg-type]
    ).all() if task_ids else []
    task_progress_reports = session.exec(
        select(TaskProgressReport).where(TaskProgressReport.task_id.in_(task_ids))  # type: ignore[arg-type]
    ).all() if task_ids else []
    task_proofs = session.exec(
        select(TaskProof).where(TaskProof.task_id.in_(task_ids))  # type: ignore[arg-type]
    ).all() if task_ids else []
    task_dependencies = session.exec(
        select(TaskDependency).where(
            TaskDependency.blocking_task_id.in_(task_ids)  # type: ignore[arg-type]
        )
    ).all() if task_ids else []
    audit_logs = session.exec(
        select(AuditLog).where(AuditLog.entity_id.in_(task_ids))  # type: ignore[arg-type]
    ).all() if task_ids else []
    permissions = session.exec(select(Permission)).all()

    bundle = {
        "company": model_to_dict(company),
        "departments": [model_to_dict(item) for item in departments],
        "roles": [model_to_dict(item) for item in roles],
        "permissions": [model_to_dict(item) for item in permissions],
        "users": [model_to_dict(item) for item in users],
        "user_company_roles": [model_to_dict(item) for item in user_company_roles],
        "projects": [model_to_dict(item) for item in projects],
        "project_member_roles": [model_to_dict(item) for item in project_member_roles],
        "tasks": [model_to_dict(item) for item in tasks],
        "task_comments": [model_to_dict(item) for item in task_comments],
        "task_progress_reports": [model_to_dict(item) for item in task_progress_reports],
        "task_proofs": [model_to_dict(item) for item in task_proofs],
        "task_dependencies": [model_to_dict(item) for item in task_dependencies],
        "audit_logs": [model_to_dict(item) for item in audit_logs],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(__import__("json").dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"output_path": str(output_path), "tasks": len(tasks), "projects": len(projects), "users": len(users)}


def merge_rows(session: Session, model_cls: type[SQLModel], rows: list[dict[str, Any]]) -> int:
    """Merge rows into DB for given SQLModel class."""

    count = 0
    for row in rows:
        instance = model_cls.model_validate(row)
        session.merge(instance)
        count += 1
    return count


def import_demo_data(session: Session, input_path: Path) -> dict[str, Any]:
    """Import demo data bundle into database with upsert behavior."""

    raw_text = input_path.read_text(encoding="utf-8")
    payload = __import__("json").loads(raw_text)

    merge_rows(session, Company, [payload["company"]])
    merge_rows(session, Department, payload.get("departments", []))
    merge_rows(session, Role, payload.get("roles", []))
    merge_rows(session, Permission, payload.get("permissions", []))
    merge_rows(session, User, payload.get("users", []))
    merge_rows(session, UserCompanyRole, payload.get("user_company_roles", []))
    merge_rows(session, Project, payload.get("projects", []))
    merge_rows(session, ProjectMemberRole, payload.get("project_member_roles", []))
    merge_rows(session, Task, payload.get("tasks", []))
    merge_rows(session, TaskComment, payload.get("task_comments", []))
    merge_rows(session, TaskProgressReport, payload.get("task_progress_reports", []))
    merge_rows(session, TaskProof, payload.get("task_proofs", []))
    merge_rows(session, TaskDependency, payload.get("task_dependencies", []))
    merge_rows(session, AuditLog, payload.get("audit_logs", []))
    session.commit()

    return {
        "input_path": str(input_path),
        "projects": len(payload.get("projects", [])),
        "tasks": len(payload.get("tasks", [])),
        "users": len(payload.get("users", [])),
    }


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for seed/export/import actions."""

    parser = argparse.ArgumentParser(description="Director dashboard demo data utility")
    parser.add_argument(
        "--action",
        choices=["seed", "export", "import", "seed-export"],
        default="seed-export",
    )
    parser.add_argument("--file", default=str(DEFAULT_EXPORT_PATH))
    return parser.parse_args()


def main() -> None:
    """Run utility command."""

    args = parse_args()
    data_file = Path(args.file)
    with Session(engine) as session:
        if args.action == "seed":
            result = seed_demo_data(session)
            print(result)
            return
        if args.action == "export":
            result = export_demo_data(session, data_file)
            print(result)
            return
        if args.action == "import":
            result = import_demo_data(session, data_file)
            print(result)
            return
        seed_result = seed_demo_data(session)
        export_result = export_demo_data(session, data_file)
        print({"seed": seed_result, "export": export_result})


if __name__ == "__main__":
    main()
