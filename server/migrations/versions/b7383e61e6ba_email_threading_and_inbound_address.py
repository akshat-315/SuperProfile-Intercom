"""email threading and inbound address

Revision ID: b7383e61e6ba
Revises: 6aa04b7734cd
Create Date: 2026-08-02 13:04:02.344428

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7383e61e6ba"
down_revision: str | Sequence[str] | None = "6aa04b7734cd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("external_id", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("in_reply_to", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_messages_in_reply_to"), "messages", ["in_reply_to"], unique=False)
    op.create_unique_constraint(
        "uq_message_external_id", "messages", ["workspace_id", "external_id"]
    )

    op.add_column("workspaces", sa.Column("inbound_token", sa.String(length=140), nullable=True))
    op.execute("UPDATE workspaces SET inbound_token = slug WHERE inbound_token IS NULL")
    op.alter_column("workspaces", "inbound_token", nullable=False)
    op.create_unique_constraint("uq_workspace_inbound_token", "workspaces", ["inbound_token"])


def downgrade() -> None:
    op.drop_constraint("uq_workspace_inbound_token", "workspaces", type_="unique")
    op.drop_column("workspaces", "inbound_token")
    op.drop_constraint("uq_message_external_id", "messages", type_="unique")
    op.drop_index(op.f("ix_messages_in_reply_to"), table_name="messages")
    op.drop_column("messages", "in_reply_to")
    op.drop_column("messages", "external_id")
