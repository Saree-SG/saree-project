"""add incident module (issue log + knowledge base)

Revision ID: 0032_add_incident_module
Revises: 0031_add_attendance_module
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0032_add_incident_module"
down_revision = "0031_add_attendance_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incident",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=True),
        sa.Column("solution", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reported_by", sa.Uuid(), nullable=False),
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"], name="fk_incident_company_id"),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], name="fk_incident_project_id"),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"], name="fk_incident_task_id"),
        sa.ForeignKeyConstraint(["reported_by"], ["user.id"], name="fk_incident_reported_by"),
        sa.ForeignKeyConstraint(["resolved_by"], ["user.id"], name="fk_incident_resolved_by"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incident_company_id", "incident", ["company_id"])
    op.create_index("ix_incident_project_id", "incident", ["project_id"])
    op.create_index("ix_incident_task_id", "incident", ["task_id"])
    op.create_index("ix_incident_category", "incident", ["category"])
    op.create_index("ix_incident_status", "incident", ["status"])
    op.create_index("ix_incident_reported_by", "incident", ["reported_by"])

    op.create_table(
        "incidentattachment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("file_type", sa.String(length=20), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incident.id"], name="fk_incidentattachment_incident_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_incidentattachment_incident_id", "incidentattachment", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_incidentattachment_incident_id", table_name="incidentattachment")
    op.drop_table("incidentattachment")
    op.drop_index("ix_incident_reported_by", table_name="incident")
    op.drop_index("ix_incident_status", table_name="incident")
    op.drop_index("ix_incident_category", table_name="incident")
    op.drop_index("ix_incident_task_id", table_name="incident")
    op.drop_index("ix_incident_project_id", table_name="incident")
    op.drop_index("ix_incident_company_id", table_name="incident")
    op.drop_table("incident")
