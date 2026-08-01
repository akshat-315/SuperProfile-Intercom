from datetime import datetime

from fastapi import APIRouter, Query, status

from app.deps import InWorkspace
from app.errors import AppError
from app.models import RESOLVED, STATUSES, Conversation, Message, User
from app.schemas.inbox import (
    AssigneeOut,
    AssignRequest,
    ConversationDetail,
    ConversationList,
    ConversationRow,
    CustomerOut,
    MessageOut,
    ReplyRequest,
    SnoozeRequest,
    StatusRequest,
)
from app.services import inbox as service
from app.services.security import utcnow

router = APIRouter(prefix="/api/conversations", tags=["inbox"])

STATES = ("active", "snoozed", "resolved")


def person(user: User | None) -> AssigneeOut | None:
    return None if user is None else AssigneeOut(id=user.id, name=user.name)


def row_out(row: service.Row) -> ConversationRow:
    c = row.conversation
    return ConversationRow(
        id=c.id,
        channel=c.channel,
        status=c.status,
        subject=c.subject,
        customer=CustomerOut(
            id=row.customer.id, name=row.customer.display_name, email=row.customer.email
        ),
        assignee=person(row.assignee),
        snoozed_until=c.snoozed_until,
        last_message_at=c.last_message_at,
        unread=row.unread,
        preview=row.preview,
    )


def message_out(message: Message, authors: dict[int, User]) -> MessageOut:
    author = authors.get(message.author_user_id) if message.author_user_id else None
    return MessageOut(
        id=message.id,
        seq=message.seq,
        direction=message.direction,
        author=person(author),
        body_text=message.body_text,
        client_msg_id=message.client_msg_id,
        read_at=message.read_at,
        created_at=message.created_at,
    )


async def _mine(signed_in: InWorkspace, conversation_id: int) -> Conversation:
    thread = await service.get_thread(
        signed_in.db, conversation_id, user=signed_in.user, role=signed_in.role or ""
    )
    return thread.conversation


@router.get("", response_model=ConversationList)
async def list_conversations(
    signed_in: InWorkspace,
    state: str = Query(default="active"),
    channel: str | None = Query(default=None),
    assignee: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
) -> ConversationList:
    if state not in STATES:
        raise AppError("bad_state", f"Pick one of {', '.join(STATES)}.", status_code=400)

    page = await service.list_conversations(
        signed_in.db,
        user=signed_in.user,
        role=signed_in.role or "",
        state=state,
        channel=channel,
        assignee=assignee,
        cursor=cursor,
        now=utcnow(),
    )
    return ConversationList(items=[row_out(row) for row in page.rows], next_cursor=page.next_cursor)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: int, signed_in: InWorkspace) -> ConversationDetail:
    thread = await service.get_thread(
        signed_in.db, conversation_id, user=signed_in.user, role=signed_in.role or ""
    )
    await service.mark_read(signed_in.db, thread.conversation, utcnow())
    await signed_in.db.commit()

    return ConversationDetail(
        conversation=row_out(
            service.Row(
                conversation=thread.conversation,
                customer=thread.customer,
                assignee=thread.assignee,
                unread=0,
                preview="",
            )
        ),
        messages=[message_out(m, thread.authors) for m in thread.messages],
    )


@router.post(
    "/{conversation_id}/reply", response_model=MessageOut, status_code=status.HTTP_201_CREATED
)
async def reply(conversation_id: int, body: ReplyRequest, signed_in: InWorkspace) -> MessageOut:
    conversation = await _mine(signed_in, conversation_id)
    now = utcnow()

    message = await service.reply(
        signed_in.db,
        conversation,
        author=signed_in.user,
        body=body.body,
        client_msg_id=body.client_msg_id,
        now=now,
    )

    if body.snooze_until is not None:
        await service.snooze(signed_in.db, conversation, _aware(body.snooze_until))
    elif body.resolve:
        await service.set_status(signed_in.db, conversation, RESOLVED)

    await signed_in.db.commit()
    return message_out(message, {signed_in.user.id: signed_in.user})


@router.patch("/{conversation_id}/assign", status_code=status.HTTP_204_NO_CONTENT)
async def assign(conversation_id: int, body: AssignRequest, signed_in: InWorkspace) -> None:
    conversation = await _mine(signed_in, conversation_id)
    await service.assign(signed_in.db, conversation, body.user_id)
    await signed_in.db.commit()


@router.patch("/{conversation_id}/status", status_code=status.HTTP_204_NO_CONTENT)
async def set_status(conversation_id: int, body: StatusRequest, signed_in: InWorkspace) -> None:
    if body.status not in STATUSES:
        raise AppError("bad_status", f"Pick one of {', '.join(STATUSES)}.", status_code=400)
    conversation = await _mine(signed_in, conversation_id)
    await service.set_status(signed_in.db, conversation, body.status)
    await signed_in.db.commit()


@router.patch("/{conversation_id}/snooze", status_code=status.HTTP_204_NO_CONTENT)
async def snooze(conversation_id: int, body: SnoozeRequest, signed_in: InWorkspace) -> None:
    conversation = await _mine(signed_in, conversation_id)
    now = utcnow()

    if body.body:
        await service.reply(
            signed_in.db,
            conversation,
            author=signed_in.user,
            body=body.body,
            client_msg_id=None,
            now=now,
        )

    await service.snooze(signed_in.db, conversation, _aware(body.until))
    await signed_in.db.commit()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=utcnow().tzinfo)
