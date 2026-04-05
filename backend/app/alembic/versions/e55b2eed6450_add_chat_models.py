"""add chat models

Revision ID: e55b2eed6450
Revises: d4e2c6a91b12
Create Date: 2026-03-26 20:56:26.242110

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'e55b2eed6450'
down_revision = 'd4e2c6a91b12'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'chatroom',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('company_id', sa.Uuid(), nullable=False),
        sa.Column('room_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['company.id']),
        sa.ForeignKeyConstraint(['created_by'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_chatroom_company_id'), 'chatroom', ['company_id'], unique=False)
    op.create_index(op.f('ix_chatroom_created_by'), 'chatroom', ['created_by'], unique=False)

    op.create_table(
        'chatmember',
        sa.Column('room_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('role', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('left_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['chatroom.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('room_id', 'user_id'),
        sa.UniqueConstraint('room_id', 'user_id'),
    )

    op.create_table(
        'chatmessage',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('room_id', sa.Uuid(), nullable=False),
        sa.Column('sender_id', sa.Uuid(), nullable=False),
        sa.Column('message_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['chatroom.id']),
        sa.ForeignKeyConstraint(['sender_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_chatmessage_room_id'), 'chatmessage', ['room_id'], unique=False)
    op.create_index(op.f('ix_chatmessage_sender_id'), 'chatmessage', ['sender_id'], unique=False)

    op.create_table(
        'chatattachment',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('message_id', sa.Uuid(), nullable=False),
        sa.Column('filename', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('storage_path', sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=False),
        sa.Column('public_url', sqlmodel.sql.sqltypes.AutoString(length=1024), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['chatmessage.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_chatattachment_message_id'),
        'chatattachment',
        ['message_id'],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f('ix_chatattachment_message_id'), table_name='chatattachment')
    op.drop_table('chatattachment')

    op.drop_index(op.f('ix_chatmessage_sender_id'), table_name='chatmessage')
    op.drop_index(op.f('ix_chatmessage_room_id'), table_name='chatmessage')
    op.drop_table('chatmessage')

    op.drop_table('chatmember')

    op.drop_index(op.f('ix_chatroom_created_by'), table_name='chatroom')
    op.drop_index(op.f('ix_chatroom_company_id'), table_name='chatroom')
    op.drop_table('chatroom')
