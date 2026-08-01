"""pending invite on user

Revision ID: 7ac32d903fbf
Revises: 57113ce30db2
Create Date: 2026-08-01 20:39:35.809621

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7ac32d903fbf'
down_revision: Union[str, Sequence[str], None] = '57113ce30db2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('pending_invite_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(None, 'users', 'invites', ['pending_invite_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'users', type_='foreignkey')
    op.drop_column('users', 'pending_invite_id')
