from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import (
    ADMIN,
    INBOUND,
    OPEN,
    OUTBOUND,
    RESOLVED,
    Conversation,
    Customer,
    Message,
    User,
    WorkspaceMember,
)
from app.workspace_filter import all_workspaces, require_workspace_id

log = get_logger(__name__)

PAGE_SIZE = 30
NOT_FOUND = "That conversation could not be found."
NOT_IN_TEAM = "That person is not in this workspace."


@dataclass(frozen=True)
class Row:
    conversation: Conversation
    customer: Customer
    assignee: User | None
    unread: int
    preview: str


@dataclass(frozen=True)
class Page:
    rows: list[Row]
    next_cursor: str | None


@dataclass(frozen=True)
class Thread:
    conversation: Conversation
    customer: Customer
    assignee: User | None
    messages: list[Message]
    authors: dict[int, User]


def not_found() -> AppError:
    return AppError("not_found", NOT_FOUND, status_code=404)


def visible_to(user: User, role: str):
    if role == ADMIN:
        return None
    return or_(
        Conversation.assignee_user_id == user.id,
        Conversation.assignee_user_id.is_(None),
    )


def _state_filter(state: str, now: datetime):
    if state == "resolved":
        return Conversation.status == RESOLVED
    snoozed = Conversation.snoozed_until.is_not(None) & (Conversation.snoozed_until > now)
    if state == "snoozed":
        return (Conversation.status == OPEN) & snoozed
    return (Conversation.status == OPEN) & ~snoozed


async def list_conversations(
    db: AsyncSession,
    *,
    user: User,
    role: str,
    state: str = "active",
    channel: str | None = None,
    assignee: str | None = None,
    cursor: str | None = None,
    now: datetime,
) -> Page:
    query = select(Conversation).where(_state_filter(state, now))

    allowed = visible_to(user, role)
    if allowed is not None:
        query = query.where(allowed)

    if channel is not None:
        query = query.where(Conversation.channel == channel)

    if assignee == "me":
        query = query.where(Conversation.assignee_user_id == user.id)
    elif assignee == "unassigned":
        query = query.where(Conversation.assignee_user_id.is_(None))
    elif assignee is not None and assignee.isdigit():
        query = query.where(Conversation.assignee_user_id == int(assignee))

    if cursor is not None:
        query = query.where(Conversation.last_message_at < _decode_cursor(cursor))

    conversations = list(
        await db.scalars(query.order_by(Conversation.last_message_at.desc()).limit(PAGE_SIZE + 1))
    )
    has_more = len(conversations) > PAGE_SIZE
    conversations = conversations[:PAGE_SIZE]

    if not conversations:
        return Page(rows=[], next_cursor=None)

    customers = await _customers_for(db, {c.customer_id for c in conversations})
    assignees = await _users_for(db, {c.assignee_user_id for c in conversations})

    rows = [
        Row(
            conversation=c,
            customer=customers[c.customer_id],
            assignee=assignees.get(c.assignee_user_id) if c.assignee_user_id else None,
            unread=c.unread_count,
            preview=c.last_message_preview,
        )
        for c in conversations
        if c.customer_id in customers
    ]

    return Page(
        rows=rows,
        next_cursor=_encode_cursor(conversations[-1].last_message_at) if has_more else None,
    )


async def get_thread(db: AsyncSession, conversation_id: int, *, user: User, role: str) -> Thread:
    conversation = await db.scalar(select(Conversation).where(Conversation.id == conversation_id))
    if conversation is None:
        raise not_found()

    allowed = visible_to(user, role)
    if allowed is not None and conversation.assignee_user_id not in (None, user.id):
        raise not_found()

    customer = await db.scalar(select(Customer).where(Customer.id == conversation.customer_id))
    if customer is None:
        raise not_found()

    messages = list(
        await db.scalars(
            select(Message).where(Message.conversation_id == conversation.id).order_by(Message.seq)
        )
    )
    authors = await _users_for(db, {m.author_user_id for m in messages})
    assignees = await _users_for(db, {conversation.assignee_user_id})

    return Thread(
        conversation=conversation,
        customer=customer,
        assignee=assignees.get(conversation.assignee_user_id)
        if conversation.assignee_user_id
        else None,
        messages=messages,
        authors=authors,
    )


async def reply(
    db: AsyncSession,
    conversation: Conversation,
    *,
    author: User,
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

    message = await add_message(
        db,
        conversation,
        direction=OUTBOUND,
        author_user_id=author.id,
        body=body,
        client_msg_id=client_msg_id,
        now=now,
    )
    if conversation.status == RESOLVED:
        conversation.status = OPEN
        await db.flush()
    return message


SEQ_ATTEMPTS = 5


async def add_message(
    db: AsyncSession,
    conversation: Conversation,
    *,
    direction: str,
    author_user_id: int | None,
    body: str,
    client_msg_id: UUID | None,
    now: datetime,
) -> Message:
    text = body.strip()
    message: Message | None = None

    for attempt in range(SEQ_ATTEMPTS):
        candidate = Message(
            workspace_id=require_workspace_id(),
            conversation_id=conversation.id,
            seq=await _next_seq(db, conversation.id),
            direction=direction,
            author_user_id=author_user_id,
            body_text=text,
            client_msg_id=client_msg_id,
        )
        try:
            async with db.begin_nested():
                db.add(candidate)
            message = candidate
            break
        except IntegrityError:
            if client_msg_id is not None:
                taken = await db.scalar(
                    select(Message).where(
                        Message.conversation_id == conversation.id,
                        Message.client_msg_id == client_msg_id,
                    )
                )
                if taken is not None:
                    return taken
            if attempt == SEQ_ATTEMPTS - 1:
                raise
            log.info("inbox.seq_retry", conversation_id=conversation.id, attempt=attempt + 1)

    assert message is not None

    conversation.last_message_at = now
    conversation.snoozed_until = None
    conversation.last_message_preview = text[:200]
    if direction == INBOUND:
        conversation.unread_count += 1
    await db.flush()
    return message


async def assign(db: AsyncSession, conversation: Conversation, user_id: int | None) -> None:
    if user_id is not None:
        member = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.user_id == user_id))
        if member is None:
            raise AppError("not_in_team", NOT_IN_TEAM, status_code=404)
    conversation.assignee_user_id = user_id
    await db.flush()


async def set_status(db: AsyncSession, conversation: Conversation, status: str) -> None:
    conversation.status = status
    if status == OPEN:
        conversation.snoozed_until = None
    await db.flush()


async def snooze(db: AsyncSession, conversation: Conversation, until: datetime) -> None:
    conversation.snoozed_until = until
    conversation.status = OPEN
    await db.flush()


async def mark_read(db: AsyncSession, conversation: Conversation, now: datetime) -> int:
    result = await db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.direction == INBOUND,
            Message.read_at.is_(None),
        )
        .values(read_at=now)
    )
    conversation.unread_count = 0
    await db.flush()
    return result.rowcount or 0


async def _next_seq(db: AsyncSession, conversation_id: int) -> int:
    highest = await db.scalar(
        select(func.max(Message.seq)).where(Message.conversation_id == conversation_id)
    )
    return (highest or 0) + 1


async def _customers_for(db: AsyncSession, ids: set[int]) -> dict[int, Customer]:
    if not ids:
        return {}
    rows = await db.scalars(select(Customer).where(Customer.id.in_(ids)))
    return {row.id: row for row in rows}


async def _users_for(db: AsyncSession, ids: set[int | None]) -> dict[int, User]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    with all_workspaces(reason="a person is global; the rows naming them are already filtered"):
        rows = await db.scalars(select(User).where(User.id.in_(wanted)))
        return {row.id: row for row in rows}


def _encode_cursor(at: datetime) -> str:
    return at.isoformat()


def _decode_cursor(cursor: str) -> datetime:
    try:
        return datetime.fromisoformat(cursor)
    except ValueError as exc:
        raise AppError("bad_cursor", "That page marker is not valid.", status_code=400) from exc
