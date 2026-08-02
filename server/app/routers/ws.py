import asyncio
import json
from collections.abc import Awaitable, Callable
from contextlib import suppress

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.config import settings
from app.db import session_factory
from app.deps import InWorkspace, client_ip
from app.logging import get_logger
from app.models import Conversation
from app.schemas.ws import TicketOut
from app.services import events, ratelimit, tickets
from app.services.connections import Connection, pump, registry
from app.workspace_filter import use_workspace

log = get_logger(__name__)

router = APIRouter(tags=["realtime"])

REFUSED = 1008
STRIKE_LIMIT = 10

INBOUND_LIMITS = {events.TYPING: ratelimit.WS_TYPING}

Handler = Callable[[Connection, dict], Awaitable[None]]


@router.post("/api/ws/ticket", response_model=TicketOut)
async def agent_ticket(request: Request, signed_in: InWorkspace) -> TicketOut:
    ratelimit.enforce(ratelimit.WS_TICKET, f"{client_ip(request)}:{signed_in.user.id}")
    assert signed_in.workspace is not None
    claim = tickets.Claim(
        kind=tickets.AGENT,
        workspace_id=signed_in.workspace.id,
        user_id=signed_in.user.id,
        name=signed_in.user.name,
        role=signed_in.role,
    )
    return TicketOut(ticket=tickets.mint(claim), expires_in=tickets.TTL_SECONDS)


def _decode(raw: str) -> dict | None:
    try:
        frame = json.loads(raw)
    except ValueError:
        return None
    return frame if isinstance(frame, dict) else None


def _within_limits(connection: Connection, kind: object) -> bool:
    limit = INBOUND_LIMITS.get(kind) if isinstance(kind, str) else None
    if limit is None:
        return True
    if ratelimit.allow(limit, connection.whoami()):
        return True
    connection.strikes += 1
    log.warning("socket.rate_limited", who=connection.whoami(), strikes=connection.strikes)
    return False


async def serve(
    connection: Connection,
    *,
    join: Callable[[Connection], None],
    leave: Callable[[Connection], None],
    side: str,
    on_frame: Handler,
) -> None:
    await connection.socket.accept()
    join(connection)
    writer = asyncio.create_task(pump(connection))
    connection.offer({"t": events.RESYNC})
    log.info("socket.opened", side=side, workspace_id=connection.workspace_id)

    try:
        while True:
            frame = _decode(await connection.socket.receive_text())
            if frame is None:
                continue
            if not _within_limits(connection, frame.get("t")):
                connection.offer({"t": events.ERROR, "code": "rate_limited"})
                if connection.strikes >= STRIKE_LIMIT:
                    await connection.socket.close(code=REFUSED)
                    break
                continue
            await on_frame(connection, frame)
    except WebSocketDisconnect:
        pass
    finally:
        leave(connection)
        writer.cancel()
        with suppress(asyncio.CancelledError):
            await writer
        log.info("socket.closed", side=side, workspace_id=connection.workspace_id)


async def _conversation_for(connection: Connection, frame: dict) -> Conversation | None:
    conversation_id = frame.get("conversation")
    if not isinstance(conversation_id, int):
        return None

    async with session_factory() as db:
        with use_workspace(connection.workspace_id):
            where = [Conversation.id == conversation_id]
            if connection.customer_id is not None:
                where.append(Conversation.customer_id == connection.customer_id)
            conversation = await db.scalar(select(Conversation).where(*where))

    if conversation is None:
        return None
    if connection.customer_id is None and not connection.may_see(conversation.assignee_user_id):
        return None
    return conversation


async def agent_frame(connection: Connection, frame: dict) -> None:
    if frame.get("t") != events.TYPING:
        return
    conversation = await _conversation_for(connection, frame)
    if conversation is None:
        return
    events.typing_changed(
        conversation, who=events.AGENT, name=connection.name, on=bool(frame.get("on"))
    )


async def visitor_frame(connection: Connection, frame: dict) -> None:
    if frame.get("t") != events.TYPING:
        return
    conversation = await _conversation_for(connection, frame)
    if conversation is None:
        return
    events.typing_changed(conversation, who=events.CUSTOMER, name=None, on=bool(frame.get("on")))


@router.websocket("/ws/agent")
async def agent_socket(socket: WebSocket, ticket: str = Query(default="")) -> None:
    origin = socket.headers.get("origin")
    if origin is not None and origin.lower() != settings.app_origin:
        log.warning("socket.foreign_origin", origin=origin)
        await socket.close(code=REFUSED)
        return

    claim = tickets.redeem(ticket)
    if claim is None or claim.kind != tickets.AGENT:
        await socket.close(code=REFUSED)
        return

    await serve(
        Connection(
            socket=socket,
            workspace_id=claim.workspace_id,
            user_id=claim.user_id,
            name=claim.name,
            role=claim.role,
        ),
        join=registry.join_agents,
        leave=registry.leave_agents,
        side=tickets.AGENT,
        on_frame=agent_frame,
    )


@router.websocket("/ws/widget")
async def widget_socket(socket: WebSocket, ticket: str = Query(default="")) -> None:
    claim = tickets.redeem(ticket)
    if claim is None or claim.kind != tickets.VISITOR or claim.customer_id is None:
        await socket.close(code=REFUSED)
        return

    await serve(
        Connection(
            socket=socket,
            workspace_id=claim.workspace_id,
            customer_id=claim.customer_id,
        ),
        join=registry.join_visitors,
        leave=registry.leave_visitors,
        side=tickets.VISITOR,
        on_frame=visitor_frame,
    )
