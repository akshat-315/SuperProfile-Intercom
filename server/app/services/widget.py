from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import (
    CHAT,
    INBOUND,
    OPEN,
    RESOLVED,
    Conversation,
    Customer,
    Message,
    User,
    Workspace,
)
from app.services import inbox
from app.services.security import new_visitor_id
from app.workspace_filter import all_workspaces, require_workspace_id, use_workspace

log = get_logger(__name__)

UNKNOWN_KEY = "That widget key is not recognised."
TOO_MANY_OPEN = "You already have three conversations open. Continue one of those."
MAX_OPEN = 3
FIRST_SEQ = 1
TITLE_LENGTH = 60


@dataclass(frozen=True)
class Identified:
    customer: Customer
    workspace: Workspace
    visitor_id: str


async def workspace_for_key(db: AsyncSession, key: str) -> Workspace:
    with all_workspaces(reason="a widget key is public and names its own workspace"):
        workspace = await db.scalar(select(Workspace).where(Workspace.widget_key == key))
    if workspace is None:
        raise AppError("unknown_widget", UNKNOWN_KEY, status_code=404)
    return workspace


async def identify(
    db: AsyncSession,
    workspace: Workspace,
    *,
    known_visitor_id: str | None,
    name: str | None,
    email: str | None,
    now: datetime,
) -> Identified:
    email = (email or "").strip() or None
    name = (name or "").strip() or None

    with use_workspace(workspace.id):
        by_browser = (
            await db.scalar(select(Customer).where(Customer.visitor_id == known_visitor_id))
            if known_visitor_id
            else None
        )
        by_email = (
            await db.scalar(select(Customer).where(Customer.email == email)) if email else None
        )

        customer = by_email or by_browser
        if customer is None:
            customer = await _claim(
                db, workspace, name=name, email=email, visitor_id=known_visitor_id
            )
        elif by_email is not None and by_browser is not None and by_browser.id != by_email.id:
            await _merge(db, keep=by_email, drop=by_browser)

        if name:
            customer.name = name
        if email:
            customer.email = email
        if known_visitor_id:
            customer.visitor_id = known_visitor_id
        elif customer.visitor_id is None:
            customer.visitor_id = new_visitor_id()
        await db.flush()

    assert customer.visitor_id is not None
    return Identified(customer=customer, workspace=workspace, visitor_id=customer.visitor_id)


async def _claim(
    db: AsyncSession,
    workspace: Workspace,
    *,
    name: str | None,
    email: str | None,
    visitor_id: str | None,
) -> Customer:
    candidate = Customer(
        workspace_id=workspace.id,
        name=name,
        email=email,
        visitor_id=visitor_id or new_visitor_id(),
    )
    try:
        async with db.begin_nested():
            db.add(candidate)
        return candidate
    except IntegrityError:
        taken = await _already_there(db, email=email, visitor_id=candidate.visitor_id)
        if taken is None:
            raise
        log.info("widget.identify_race", workspace_id=workspace.id, customer_id=taken.id)
        return taken


async def _already_there(
    db: AsyncSession, *, email: str | None, visitor_id: str
) -> Customer | None:
    if email:
        found = await db.scalar(select(Customer).where(Customer.email == email))
        if found is not None:
            return found
    return await db.scalar(select(Customer).where(Customer.visitor_id == visitor_id))


async def _merge(db: AsyncSession, *, keep: Customer, drop: Customer) -> None:
    await db.execute(
        update(Conversation).where(Conversation.customer_id == drop.id).values(customer_id=keep.id)
    )
    await db.delete(drop)
    await db.flush()
    log.info("widget.customer_merged", kept=keep.id, dropped=drop.id)


@dataclass(frozen=True)
class ThreadRow:
    conversation: Conversation
    opening: str
    unread: int


async def conversations_for(db: AsyncSession, customer: Customer) -> list[ThreadRow]:
    rows = list(
        await db.scalars(
            select(Conversation)
            .where(Conversation.customer_id == customer.id, Conversation.channel == CHAT)
            .order_by(Conversation.last_message_at.desc())
        )
    )
    if not rows:
        return []

    ids = [row.id for row in rows]
    openings = dict(
        (
            await db.execute(
                select(Message.conversation_id, Message.body_text).where(
                    Message.conversation_id.in_(ids), Message.seq == FIRST_SEQ
                )
            )
        ).all()
    )
    unread = dict(
        (
            await db.execute(
                select(Message.conversation_id, func.count(Message.id))
                .where(
                    Message.conversation_id.in_(ids),
                    Message.direction != INBOUND,
                    Message.read_at.is_(None),
                )
                .group_by(Message.conversation_id)
            )
        ).all()
    )
    return [
        ThreadRow(
            conversation=row,
            opening=openings.get(row.id, ""),
            unread=unread.get(row.id, 0),
        )
        for row in rows
    ]


async def opening_of(db: AsyncSession, conversation: Conversation) -> str:
    body = await db.scalar(
        select(Message.body_text).where(
            Message.conversation_id == conversation.id, Message.seq == FIRST_SEQ
        )
    )
    return body or ""


async def open_count(db: AsyncSession, customer: Customer) -> int:
    return (
        await db.scalar(
            select(func.count(Conversation.id)).where(
                Conversation.customer_id == customer.id, Conversation.status == OPEN
            )
        )
    ) or 0


async def start_conversation(
    db: AsyncSession, customer: Customer, *, now: datetime
) -> Conversation:
    if await open_count(db, customer) >= MAX_OPEN:
        raise AppError("too_many_open", TOO_MANY_OPEN, status_code=409)

    conversation = Conversation(
        workspace_id=require_workspace_id(),
        customer_id=customer.id,
        channel=CHAT,
        status=OPEN,
        last_message_at=now,
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def conversation_of(
    db: AsyncSession, customer: Customer, conversation_id: int
) -> Conversation:
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.customer_id == customer.id,
            Conversation.channel == CHAT,
        )
    )
    if conversation is None:
        raise AppError("not_found", "That conversation could not be found.", status_code=404)
    return conversation


async def messages_of(
    db: AsyncSession, conversation: Conversation, *, after_seq: int = 0
) -> list[Message]:
    return list(
        await db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id, Message.seq > after_seq)
            .order_by(Message.seq)
        )
    )


async def mark_agent_replies_read(
    db: AsyncSession, conversation: Conversation, now: datetime
) -> None:
    await db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.direction != INBOUND,
            Message.read_at.is_(None),
        )
        .values(read_at=now)
    )
    await db.flush()


def reopen(conversation: Conversation) -> None:
    if conversation.status == RESOLVED:
        conversation.status = OPEN
    conversation.snoozed_until = None


async def start_with_message(
    db: AsyncSession,
    customer: Customer,
    *,
    body: str,
    client_msg_id: UUID | None,
    now: datetime,
) -> tuple[Conversation, Message]:
    conversation = await start_conversation(db, customer, now=now)
    message = await inbox.add_message(
        db,
        conversation,
        direction=INBOUND,
        author_user_id=None,
        body=body,
        client_msg_id=client_msg_id,
        now=now,
    )
    return conversation, message


async def send(
    db: AsyncSession,
    conversation: Conversation,
    *,
    body: str,
    client_msg_id: UUID | None,
    now: datetime,
) -> Message:
    if client_msg_id is not None:
        existing = await db.scalar(
            select(Message).where(
                Message.conversation_id == conversation.id,
                Message.client_msg_id == client_msg_id,
            )
        )
        if existing is not None:
            return existing

    reopen(conversation)
    return await inbox.add_message(
        db,
        conversation,
        direction=INBOUND,
        author_user_id=None,
        body=body,
        client_msg_id=client_msg_id,
        now=now,
    )


async def unread_for(db: AsyncSession, conversation: Conversation) -> int:
    return (
        await db.scalar(
            select(func.count(Message.id)).where(
                Message.conversation_id == conversation.id,
                Message.direction != INBOUND,
                Message.read_at.is_(None),
            )
        )
    ) or 0


async def authors_of(db: AsyncSession, messages: list[Message]) -> dict[int, str]:
    ids = {m.author_user_id for m in messages if m.author_user_id is not None}
    if not ids:
        return {}
    with all_workspaces(reason="a message author is a person, looked up by id"):
        rows = await db.scalars(select(User).where(User.id.in_(ids)))
    return {row.id: row.name for row in rows}
