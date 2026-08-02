from fastapi import APIRouter, Query, Request, Response, status

from app.db import SessionDep
from app.deps import Visitor, client_ip
from app.models import INBOUND, Conversation, Message
from app.schemas.widget import (
    ChatMessage,
    SendRequest,
    SessionOut,
    SessionRequest,
    ThreadDetail,
    ThreadList,
    ThreadOut,
    VisitorOut,
)
from app.schemas.ws import TicketOut
from app.services import events, ratelimit, tickets
from app.services import visitor as visitor_tokens
from app.services import widget as service
from app.services.security import utcnow

router = APIRouter(prefix="/api/widget", tags=["widget"])


def thread_out(conversation: Conversation, opening: str, unread: int) -> ThreadOut:
    return ThreadOut(
        id=conversation.id,
        status=conversation.status,
        title=conversation.subject or opening[: service.TITLE_LENGTH] or "New conversation",
        preview=conversation.last_message_preview or opening,
        unread=unread,
        last_at=conversation.last_message_at,
    )


def message_out(message: Message, authors: dict[int, str]) -> ChatMessage:
    return ChatMessage(
        id=message.id,
        seq=message.seq,
        sender="customer" if message.direction == INBOUND else "agent",
        author=authors.get(message.author_user_id) if message.author_user_id else None,
        body=message.body_text,
        at=message.created_at,
        client_msg_id=message.client_msg_id,
    )


@router.post("/session", response_model=SessionOut)
async def open_session(request: Request, body: SessionRequest, db: SessionDep) -> SessionOut:
    key = body.key.strip()
    ratelimit.enforce(ratelimit.WIDGET_SESSION, f"{client_ip(request)}:{key}")

    now = utcnow()
    workspace = await service.workspace_for_key(db, key)
    known = visitor_tokens.read_browser_id(body.browser_id, now=now) if body.browser_id else None

    identified = await service.identify(
        db,
        workspace,
        known_visitor_id=known,
        name=body.name,
        email=str(body.email) if body.email else None,
        now=now,
    )
    await db.commit()

    customer = identified.customer
    return SessionOut(
        session=visitor_tokens.sign_session(
            visitor_id=identified.visitor_id,
            customer_id=customer.id,
            workspace_id=workspace.id,
            now=now,
        ),
        browser_id=visitor_tokens.sign_browser_id(identified.visitor_id, now=now),
        workspace_name=workspace.name,
        greeting=workspace.widget_greeting,
        visitor=VisitorOut(id=customer.id, name=customer.name, email=customer.email),
    )


@router.post("/ws/ticket", response_model=TicketOut)
async def chat_ticket(visitor: Visitor) -> TicketOut:
    ratelimit.enforce(ratelimit.WS_TICKET, str(visitor.customer.id))
    claim = tickets.Claim(
        kind=tickets.VISITOR,
        workspace_id=visitor.workspace_id,
        customer_id=visitor.customer.id,
    )
    return TicketOut(ticket=tickets.mint(claim), expires_in=tickets.TTL_SECONDS)


@router.get("/conversations", response_model=ThreadList)
async def list_threads(visitor: Visitor) -> ThreadList:
    rows = await service.conversations_for(visitor.db, visitor.customer)
    return ThreadList(items=[thread_out(row.conversation, row.opening, row.unread) for row in rows])


@router.post("/conversations", response_model=ThreadDetail, status_code=status.HTTP_201_CREATED)
async def start_thread(visitor: Visitor, body: SendRequest) -> ThreadDetail:
    ratelimit.enforce(ratelimit.WIDGET_START, str(visitor.customer.id))

    now = utcnow()
    conversation, message = await service.start_with_message(
        visitor.db,
        visitor.customer,
        body=body.body,
        client_msg_id=body.client_msg_id,
        now=now,
    )
    await visitor.db.commit()
    events.message_saved(conversation, message)

    return ThreadDetail(
        thread=thread_out(conversation, message.body_text, 0),
        messages=[message_out(message, {})],
    )


@router.get("/conversations/{conversation_id}", response_model=ThreadDetail)
async def read_thread(
    visitor: Visitor,
    conversation_id: int,
    after_seq: int = Query(default=0, ge=0),
) -> ThreadDetail:
    conversation = await service.conversation_of(visitor.db, visitor.customer, conversation_id)
    messages = await service.messages_of(visitor.db, conversation, after_seq=after_seq)
    authors = await service.authors_of(visitor.db, messages)
    unread = await service.unread_for(visitor.db, conversation)
    opening = await service.opening_of(visitor.db, conversation)

    return ThreadDetail(
        thread=thread_out(conversation, opening, unread),
        messages=[message_out(message, authors) for message in messages],
    )


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessage)
async def send_message(visitor: Visitor, conversation_id: int, body: SendRequest) -> ChatMessage:
    ratelimit.enforce(ratelimit.WIDGET_SEND, str(visitor.customer.id))

    conversation = await service.conversation_of(visitor.db, visitor.customer, conversation_id)
    message = await service.send(
        visitor.db,
        conversation,
        body=body.body,
        client_msg_id=body.client_msg_id,
        now=utcnow(),
    )
    await visitor.db.commit()
    events.message_saved(conversation, message)
    return message_out(message, {})


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(visitor: Visitor, conversation_id: int) -> Response:
    conversation = await service.conversation_of(visitor.db, visitor.customer, conversation_id)
    await service.mark_agent_replies_read(visitor.db, conversation, utcnow())
    await visitor.db.commit()
    events.read_by(conversation, who=events.CUSTOMER)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
