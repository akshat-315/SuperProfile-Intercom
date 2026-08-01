"""pending invite on user

Revision ID: 7ac32d903fbf
Revises: 57113ce30db2
Create Date: 2026-08-01 20:39:35.809621

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7ac32d903fbf"
down_revision: str | Sequence[str] | None = "57113ce30db2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_invite_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        None, "users", "invites", ["pending_invite_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint(None, "users", type_="foreignkey")
    op.drop_column("users", "pending_invite_id")
