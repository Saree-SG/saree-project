"""drop the taskproof table (merged into progress reports)

The TaskProof entity has been removed — the on-site progress photo now doubles
as completion evidence (see 0036). This drops the now-unused table. IF EXISTS so
fresh databases (where the table was never created) are unaffected.

Revision ID: 0037_drop_taskproof
Revises: 0036_progress_report_review
Create Date: 2026-06-06
"""

from alembic import op

revision = "0037_drop_taskproof"
down_revision = "0036_progress_report_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS taskproof CASCADE")


def downgrade() -> None:
    # The TaskProof model no longer exists; the table cannot be recreated.
    pass
