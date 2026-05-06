"""quotation_add_survey_contact_fields

Revision ID: 0016_quotation_survey_contact
Revises: 5edf2c43c5c3
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision = '0016_quotation_survey_contact'
down_revision = '5edf2c43c5c3'
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(op.get_bind())
    existing = {c["name"] for c in insp.get_columns("quotation")}
    if "client_contact_title" not in existing:
        op.add_column('quotation', sa.Column('client_contact_title', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True))
    if "survey_note" not in existing:
        op.add_column('quotation', sa.Column('survey_note', sa.Text(), nullable=True))
    if "survey_start_date" not in existing:
        op.add_column('quotation', sa.Column('survey_start_date', sa.Date(), nullable=True))
    if "survey_end_date" not in existing:
        op.add_column('quotation', sa.Column('survey_end_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('quotation', 'survey_end_date')
    op.drop_column('quotation', 'survey_start_date')
    op.drop_column('quotation', 'survey_note')
    op.drop_column('quotation', 'client_contact_title')
