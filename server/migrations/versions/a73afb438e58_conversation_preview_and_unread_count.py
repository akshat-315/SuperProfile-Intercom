"""conversation preview and unread count

Revision ID: a73afb438e58
Revises: 9670a6c7d1b8
Create Date: 2026-08-01 23:36:19.190144

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a73afb438e58'
down_revision: Union[str, Sequence[str], None] = '9670a6c7d1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversations', sa.Column('last_message_preview', sa.String(length=200), nullable=False))
    op.add_column('conversations', sa.Column('unread_count', sa.Integer(), nullable=False))
    op.add_column('workspaces', sa.Column('widget_key', sa.String(length=32), nullable=False))
    op.add_column('workspaces', sa.Column('widget_greeting', sa.String(length=200), nullable=True))
    op.create_unique_constraint(None, 'workspaces', ['widget_key'])


def downgrade() -> None:
    op.drop_constraint(None, 'workspaces', type_='unique')
    op.drop_column('workspaces', 'widget_greeting')
    op.drop_column('workspaces', 'widget_key')
    op.drop_column('conversations', 'unread_count')
    op.drop_column('conversations', 'last_message_preview')
