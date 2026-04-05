"""Replace task checklist with worker progress reports (photo + percent)."""

from alembic import op
import sqlalchemy as sa


revision = "b3c8e1f42a90"
down_revision = "6a4f2d9c13b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create taskprogressreport and drop legacy taskchecklist."""

    op.create_table(
        "taskprogressreport",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("photo_url", sa.String(length=1000), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reporter_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_taskprogressreport_task_id"), "taskprogressreport", ["task_id"], unique=False)
    op.create_index(
        op.f("ix_taskprogressreport_reporter_id"),
        "taskprogressreport",
        ["reporter_id"],
        unique=False,
    )
    op.drop_index(op.f("ix_taskchecklist_task_id"), table_name="taskchecklist")
    op.drop_table("taskchecklist")


def downgrade() -> None:
    """Restore taskchecklist and remove taskprogressreport."""

    op.drop_index(op.f("ix_taskprogressreport_reporter_id"), table_name="taskprogressreport")
    op.drop_index(op.f("ix_taskprogressreport_task_id"), table_name="taskprogressreport")
    op.drop_table("taskprogressreport")

    op.create_table(
        "taskchecklist",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(length=500), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False),
        sa.Column("completed_by", sa.Uuid(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["completed_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_taskchecklist_task_id"), "taskchecklist", ["task_id"], unique=False)
