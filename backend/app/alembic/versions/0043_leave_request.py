"""leave requests: employee time-off with approval chain

Adds the leave-request module: requests, approver participants (multi-step
chain), an audit trail of decisions, and per-company approver configuration.

Revision ID: 0043_leave_request
Revises: 0042_customer_permissions
Create Date: 2026-06-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0043_leave_request"
down_revision = "0042_customer_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leaverequest",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("leave_type", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("half_day", sa.String(length=10), nullable=True),
        sa.Column("num_days", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["decided_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leaverequest_company_id", "leaverequest", ["company_id"])
    op.create_index("ix_leaverequest_user_id", "leaverequest", ["user_id"])
    op.create_index("ix_leaverequest_start_date", "leaverequest", ["start_date"])
    op.create_index("ix_leaverequest_end_date", "leaverequest", ["end_date"])
    op.create_index("ix_leaverequest_status", "leaverequest", ["status"])

    op.create_table(
        "leaveapprovalparticipant",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("leave_request_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("has_approved", sa.Boolean(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["leave_request_id"], ["leaverequest.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_leaveapprovalparticipant_leave_request_id",
        "leaveapprovalparticipant",
        ["leave_request_id"],
    )
    op.create_index(
        "ix_leaveapprovalparticipant_user_id",
        "leaveapprovalparticipant",
        ["user_id"],
    )

    op.create_table(
        "leavestagetransition",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("leave_request_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["leave_request_id"], ["leaverequest.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_leavestagetransition_leave_request_id",
        "leavestagetransition",
        ["leave_request_id"],
    )

    op.create_table(
        "leaveapproverconfig",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("approver_role_id", sa.Uuid(), nullable=True),
        sa.Column("approver_user_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"]),
        sa.ForeignKeyConstraint(["approver_role_id"], ["role.id"]),
        sa.ForeignKeyConstraint(["approver_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_leaveapproverconfig_company_id",
        "leaveapproverconfig",
        ["company_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_leaveapproverconfig_company_id", table_name="leaveapproverconfig")
    op.drop_table("leaveapproverconfig")
    op.drop_index(
        "ix_leavestagetransition_leave_request_id", table_name="leavestagetransition"
    )
    op.drop_table("leavestagetransition")
    op.drop_index(
        "ix_leaveapprovalparticipant_user_id", table_name="leaveapprovalparticipant"
    )
    op.drop_index(
        "ix_leaveapprovalparticipant_leave_request_id",
        table_name="leaveapprovalparticipant",
    )
    op.drop_table("leaveapprovalparticipant")
    op.drop_index("ix_leaverequest_status", table_name="leaverequest")
    op.drop_index("ix_leaverequest_end_date", table_name="leaverequest")
    op.drop_index("ix_leaverequest_start_date", table_name="leaverequest")
    op.drop_index("ix_leaverequest_user_id", table_name="leaverequest")
    op.drop_index("ix_leaverequest_company_id", table_name="leaverequest")
    op.drop_table("leaverequest")
