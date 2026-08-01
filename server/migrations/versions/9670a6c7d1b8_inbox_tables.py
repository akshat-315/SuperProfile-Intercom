"""inbox tables

Revision ID: 9670a6c7d1b8
Revises: 7ac32d903fbf
Create Date: 2026-08-01 21:52:29.240156

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '9670a6c7d1b8'
down_revision: Union[str, Sequence[str], None] = '7ac32d903fbf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('customers',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('email', postgresql.CITEXT(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=True),
    sa.Column('visitor_id', sa.String(length=64), nullable=True),
    sa.Column('workspace_id', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workspace_id', 'email', name='uq_customer_email'),
    sa.UniqueConstraint('workspace_id', 'visitor_id', name='uq_customer_visitor')
    )
    op.create_index(op.f('ix_customers_workspace_id'), 'customers', ['workspace_id'], unique=False)
    op.create_table('conversations',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('customer_id', sa.BigInteger(), nullable=False),
    sa.Column('channel', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('subject', sa.String(length=200), nullable=True),
    sa.Column('assignee_user_id', sa.BigInteger(), nullable=True),
    sa.Column('snoozed_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('workspace_id', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assignee_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_conversations_assignee', 'conversations', ['workspace_id', 'assignee_user_id'], unique=False)
    op.create_index(op.f('ix_conversations_customer_id'), 'conversations', ['customer_id'], unique=False)
    op.create_index('ix_conversations_recent', 'conversations', ['workspace_id', 'last_message_at'], unique=False)
    op.create_index(op.f('ix_conversations_workspace_id'), 'conversations', ['workspace_id'], unique=False)
    op.create_table('messages',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('conversation_id', sa.BigInteger(), nullable=False),
    sa.Column('seq', sa.Integer(), nullable=False),
    sa.Column('direction', sa.String(length=16), nullable=False),
    sa.Column('author_user_id', sa.BigInteger(), nullable=True),
    sa.Column('body_text', sa.Text(), nullable=False),
    sa.Column('client_msg_id', sa.UUID(), nullable=True),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('workspace_id', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('conversation_id', 'client_msg_id', name='uq_message_client_id'),
    sa.UniqueConstraint('conversation_id', 'seq', name='uq_message_seq')
    )
    op.create_index(op.f('ix_messages_conversation_id'), 'messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_messages_workspace_id'), 'messages', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_messages_workspace_id'), table_name='messages')
    op.drop_index(op.f('ix_messages_conversation_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_index(op.f('ix_conversations_workspace_id'), table_name='conversations')
    op.drop_index('ix_conversations_recent', table_name='conversations')
    op.drop_index(op.f('ix_conversations_customer_id'), table_name='conversations')
    op.drop_index('ix_conversations_assignee', table_name='conversations')
    op.drop_table('conversations')
    op.drop_index(op.f('ix_customers_workspace_id'), table_name='customers')
    op.drop_table('customers')
