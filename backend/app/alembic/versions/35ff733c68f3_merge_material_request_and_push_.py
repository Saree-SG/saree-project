"""merge_material_request_and_push_subscription

Revision ID: 35ff733c68f3
Revises: 0020_material_request, 0021_push_subscription
Create Date: 2026-05-06 17:02:56.866121

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '35ff733c68f3'
down_revision = ('0020_material_request', '0021_push_subscription')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
