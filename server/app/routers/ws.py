import asyncio
from contextlib import suppress

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.config import settings
from app.deps import InWorkspace
from app.logging import get_logger
from app.services import events, tickets
from app.services.connections import Connection, pump, registry

log = get_logger(__name__)

router = APIRouter(tags=["realtime"])

REFUSED = 1008


class TicketOut(BaseModel):
    ticket: str
    expires_in: int


@router.post("/api/ws/ticket", response_model=TicketOut)
async def agent_ticket(signed_in: InWorkspace) -> TicketOut:
    assert signed_in.workspace is not None
    claim = tickets.Claim(
        kind=tickets.AGENT,
        workspace_id=signed_in.workspace.id,
        user_id=signed_in.user.id,
        role=signed_in.role,
    )
    return TicketOut(ticket=tickets.mint(claim), expires_in=tickets.TTL_SECONDS)


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

    await socket.accept()
    connection = Connection(
        socket=socket,
        workspace_id=claim.workspace_id,
        user_id=claim.user_id,
        role=claim.role,
    )
    registry.join_agents(connection)
    writer = asyncio.create_task(pump(connection))
    log.info("socket.opened", side=tickets.AGENT, user_id=claim.user_id)

    connection.offer({"t": events.RESYNC})
    try:
        while True:
            await socket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        registry.leave_agents(connection)
        writer.cancel()
        with suppress(asyncio.CancelledError):
            await writer
        log.info("socket.closed", side=tickets.AGENT, user_id=claim.user_id)
