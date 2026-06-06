"""progress report review flow (merge proof into progress report)

The on-site progress photo now doubles as completion evidence and carries its
own review status, so the separate TaskProof flow is no longer used by the UI.

Revision ID: 0036_progress_report_review
Revises: 0035_task_checkin_location
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0036_progress_report_review"
down_revision = "0035_task_checkin_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "taskprogressreport",
        sa.Column(
            "review_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "taskprogressreport",
        sa.Column("reviewer_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "taskprogressreport",
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "taskprogressreport",
        sa.Column("review_note", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_taskprogressreport_reviewer_id_user",
        "taskprogressreport",
        "user",
        ["reviewer_id"],
        ["id"],
    )
    # Backfill: every report that existed before this review flow is treated as
    # already approved so existing task progress is preserved (it used to count
    # the moment it was submitted).
    op.execute(
        "UPDATE taskprogressreport "
        "SET review_status = 'approved', reviewed_at = created_at "
        "WHERE review_status = 'pending'"
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_taskprogressreport_reviewer_id_user",
        "taskprogressreport",
        type_="foreignkey",
    )
    op.drop_column("taskprogressreport", "review_note")
    op.drop_column("taskprogressreport", "reviewed_at")
    op.drop_column("taskprogressreport", "reviewer_id")
    op.drop_column("taskprogressreport", "review_status")
