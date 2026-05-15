"""
Daily Celery Beat jobs.

- backup_database:       pg_dump to a timestamped file under /backups/
- send_daily_summary:    aggregate KPIs (tasks overdue, completed today) and log/email
- send_weekly_excel:     generate Excel report and email to all directors every Monday 08:00 UTC
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
from datetime import date, datetime, timedelta, timezone

import emails as emails_lib  # type: ignore
from sqlmodel import Session, func, select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database.engine import sync_engine
from app.models.task import Task

logger = logging.getLogger(__name__)

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")


@celery_app.task(name="app.jobs.daily_jobs.backup_database", bind=True, max_retries=2)
def backup_database(self) -> dict:
    """
    Run pg_dump and save the result to BACKUP_DIR with a datestamp filename.
    Requires BACKUP_DIR to be writable and pg_dump to be in PATH.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{BACKUP_DIR}/saree_erp_{timestamp}.dump"

    try:
        env = {**os.environ, "PGPASSWORD": settings.POSTGRES_PASSWORD}
        result = subprocess.run(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                f"--file={filename}",
                f"--host={settings.POSTGRES_SERVER}",
                f"--port={settings.POSTGRES_PORT}",
                f"--username={settings.POSTGRES_USER}",
                f"--dbname={settings.POSTGRES_DB}",
            ],
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr}")
        logger.info("Database backup created: %s", filename)
        return {"status": "ok", "file": filename}
    except Exception as exc:
        logger.exception("Backup failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 10)


@celery_app.task(name="app.jobs.daily_jobs.send_daily_summary", bind=True, max_retries=2)
def send_daily_summary(self) -> dict:
    """
    Aggregate daily KPIs and log them (extend with email or Slack as needed).
    KPIs:
      - tasks completed today
      - tasks overdue
      - tasks due today
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    try:
        with Session(sync_engine) as session:
            completed_today = session.exec(
                select(func.count(Task.id)).where(
                    Task.status == "done",
                    Task.actual_end_time >= today_start,
                    Task.is_deleted == False,  # noqa: E712
                )
            ).one()

            overdue = session.exec(
                select(func.count(Task.id)).where(
                    Task.is_deleted == False,  # noqa: E712
                    Task.status.notin_(["done"]),  # type: ignore[attr-defined]
                    Task.end_time < now,
                )
            ).one()

            due_today = session.exec(
                select(func.count(Task.id)).where(
                    Task.is_deleted == False,  # noqa: E712
                    Task.status.notin_(["done"]),  # type: ignore[attr-defined]
                    Task.end_time >= today_start,
                    Task.end_time < today_end,
                )
            ).one()

        summary = {
            "date": today_start.date().isoformat(),
            "completed_today": completed_today,
            "overdue": overdue,
            "due_today": due_today,
        }
        logger.info("Daily summary: %s", summary)
        return summary
    except Exception as exc:
        logger.exception("Daily summary failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)


# ---------------------------------------------------------------------------
# Weekly Excel report
# ---------------------------------------------------------------------------

def _build_excel_report() -> bytes:
    """Generate Excel workbook and return raw bytes. Runs synchronously inside Celery worker."""
    # Import here to avoid circular imports at module load time
    from openpyxl import Workbook  # noqa: PLC0415

    from app.api.routes.export import (  # noqa: PLC0415
        _build_accounts,
        _build_analysis,
        _build_monthly,
        _build_projects,
        _build_tasks,
    )

    with Session(sync_engine) as session:
        from sqlalchemy import select as sa_select  # noqa: PLC0415
        from app.models.org import Company  # noqa: PLC0415
        from app.models.project import Project  # noqa: PLC0415

        # Load all companies (multi-tenant support)
        companies = session.exec(sa_select(Company)).all()
        if not companies:
            return b""

        # For now: report for first company (extend later if needed)
        company = companies[0]

        # --- sync versions of data loaders ---
        from sqlalchemy import func as sa_func  # noqa: PLC0415
        from app.models.task import Task as SyncTask  # noqa: PLC0415
        from app.models.project import Project as SyncProject  # noqa: PLC0415
        from app.models.user import User as SyncUser  # noqa: PLC0415
        from app.models.org import Department as SyncDept, UserCompanyRole as SyncUCR, Role as SyncRole  # noqa: PLC0415

        # Users
        users_q = (
            sa_select(
                SyncUser.id,
                SyncUser.full_name,
                SyncUser.email,
                SyncUser.job_title,
                SyncUser.is_active,
                SyncUser.availability_status,
                SyncUser.created_at,
                SyncDept.name.label("department_name"),
                SyncRole.name.label("role_name"),
            )
            .outerjoin(SyncDept, SyncDept.id == SyncUser.department_id)
            .outerjoin(SyncUCR, SyncUCR.user_id == SyncUser.id)
            .outerjoin(SyncRole, SyncRole.id == SyncUCR.role_id)
            .where(SyncUser.company_id == company.id)
            .order_by(SyncUser.full_name)
        )
        users = session.execute(users_q).all()

        # Projects
        assignee_user = SyncUser.__table__.alias("pm_user")
        projects_q = (
            sa_select(
                SyncProject.id,
                SyncProject.name,
                SyncProject.code,
                SyncProject.status,
                SyncProject.start_date,
                SyncProject.end_date,
                SyncProject.description,
                assignee_user.c.full_name.label("pm_name"),
                SyncDept.name.label("department_name"),
                sa_func.count(SyncTask.id).label("task_count"),
            )
            .outerjoin(assignee_user, assignee_user.c.id == SyncProject.pm_id)
            .outerjoin(SyncDept, SyncDept.id == SyncProject.department_id)
            .outerjoin(SyncTask, (SyncTask.project_id == SyncProject.id) & (SyncTask.is_deleted == False))  # noqa: E712
            .where(SyncProject.company_id == company.id, SyncProject.is_deleted == False)  # noqa: E712
            .group_by(SyncProject.id, assignee_user.c.full_name, SyncDept.name)
            .order_by(SyncProject.code)
        )
        projects = session.execute(projects_q).all()

        # Tasks
        assignee_t = SyncUser.__table__.alias("assignee")
        assignor_t = SyncUser.__table__.alias("assignor")
        tasks_q = (
            sa_select(
                SyncTask.id,
                SyncTask.name,
                SyncTask.priority,
                SyncTask.status,
                SyncTask.level,
                SyncTask.start_time,
                SyncTask.end_time,
                SyncTask.actual_end_time,
                SyncTask.module_tag,
                SyncTask.created_at,
                SyncProject.name.label("project_name"),
                SyncProject.code.label("project_code"),
                assignee_t.c.full_name.label("assignee_name"),
                assignor_t.c.full_name.label("assignor_name"),
            )
            .join(SyncProject, SyncProject.id == SyncTask.project_id)
            .outerjoin(assignee_t, assignee_t.c.id == SyncTask.assignee_id)
            .outerjoin(assignor_t, assignor_t.c.id == SyncTask.assignor_id)
            .where(
                SyncProject.company_id == company.id,
                SyncTask.is_deleted == False,  # noqa: E712
                SyncTask.level <= 1,
            )
            .order_by(SyncProject.code, SyncTask.start_time)
        )
        tasks = session.execute(tasks_q).all()

    wb = Workbook()
    wb.remove(wb.active)
    _build_analysis(wb, users, projects, tasks)
    _build_accounts(wb, users)
    _build_tasks(wb, tasks)
    _build_projects(wb, projects)
    _build_monthly(wb, tasks)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _get_report_recipients() -> list[str]:
    """Return email list from REPORT_RECIPIENTS setting (comma-separated)."""
    raw = settings.REPORT_RECIPIENTS or ""
    return [e.strip() for e in raw.split(",") if e.strip()]


@celery_app.task(name="app.jobs.daily_jobs.send_weekly_excel", bind=True, max_retries=2)
def send_weekly_excel(self) -> dict:
    """
    Generate Excel report and email it to all directors and superusers.
    Scheduled: every Monday at 08:00 UTC.
    """
    if not settings.emails_enabled:
        logger.warning("Email not configured — skipping weekly Excel report")
        return {"status": "skipped", "reason": "email_not_configured"}

    try:
        excel_bytes = _build_excel_report()
        if not excel_bytes:
            logger.warning("No company data found — skipping Excel report")
            return {"status": "skipped", "reason": "no_data"}

        recipients = _get_report_recipients()
        if not recipients:
            logger.warning("No director/superuser emails found")
            return {"status": "skipped", "reason": "no_recipients"}

        filename = f"saree_bao_cao_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
        today_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")

        html_content = f"""
        <html><body style="font-family: Calibri, Arial, sans-serif; color: #333;">
        <h2 style="color: #1F3864;">📊 Báo cáo tuần Saree ERP</h2>
        <p>Xin chào,</p>
        <p>Đính kèm là báo cáo tuần hệ thống ERP tính đến ngày <strong>{today_str}</strong>.</p>
        <p>Báo cáo bao gồm:</p>
        <ul>
            <li>📊 Tổng quan & phân tích KPI</li>
            <li>👥 Danh sách nhân sự & vai trò</li>
            <li>✅ Danh sách task (trạng thái, tiến độ)</li>
            <li>📁 Danh sách dự án</li>
            <li>📈 Báo cáo hoạt động theo tháng</li>
        </ul>
        <p style="color: #888; font-size: 12px;">Email tự động từ hệ thống Saree ERP.</p>
        </body></html>
        """

        smtp_options: dict = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
        if settings.SMTP_TLS:
            smtp_options["tls"] = True
        elif settings.SMTP_SSL:
            smtp_options["ssl"] = True
        if settings.SMTP_USER:
            smtp_options["user"] = settings.SMTP_USER
        if settings.SMTP_PASSWORD:
            smtp_options["password"] = settings.SMTP_PASSWORD

        sent = 0
        for recipient in recipients:
            msg = emails_lib.Message(
                subject=f"[Saree ERP] Báo cáo tuần {today_str}",
                html=html_content,
                mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
            )
            msg.attach(
                filename=filename,
                content_disposition="attachment",
                data=excel_bytes,
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response = msg.send(to=recipient, smtp=smtp_options)
            logger.info("Weekly Excel sent to %s: %s", recipient, response)
            sent += 1

        return {"status": "ok", "sent_to": sent, "recipients": recipients}

    except Exception as exc:
        logger.exception("Weekly Excel report failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 10)
