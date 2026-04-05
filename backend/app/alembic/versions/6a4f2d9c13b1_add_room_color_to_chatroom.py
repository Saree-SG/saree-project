"""Add room_color column to chatroom."""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6a4f2d9c13b1"
down_revision = "e55b2eed6450"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add nullable room_color to chatroom."""

    op.add_column("chatroom", sa.Column("room_color", sa.String(length=32), nullable=True))


def downgrade() -> None:
    """Drop room_color from chatroom."""

    op.drop_column("chatroom", "room_color")
