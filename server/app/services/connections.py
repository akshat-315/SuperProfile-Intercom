import asyncio
from collections import defaultdict
from contextlib import suppress
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.logging import get_logger
from app.models import ADMIN

log = get_logger(__name__)

QUEUE_LIMIT = 100
TOO_SLOW = 1013


@dataclass(eq=False)
class Connection:
    socket: WebSocket
    workspace_id: int
    user_id: int | None = None
    role: str | None = None
    customer_id: int | None = None
    queue: asyncio.Queue[dict] = field(default_factory=lambda: asyncio.Queue(maxsize=QUEUE_LIMIT))
    closing: asyncio.Task | None = None

    def offer(self, payload: dict) -> None:
        try:
            self.queue.put_nowait(payload)
        except asyncio.QueueFull:
            log.warning(
                "socket.too_slow",
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                customer_id=self.customer_id,
            )
            if self.closing is None:
                self.closing = asyncio.create_task(self._close())

    async def _close(self) -> None:
        with suppress(Exception):
            await self.socket.close(code=TOO_SLOW)

    def may_see(self, assignee_user_id: int | None) -> bool:
        if self.role == ADMIN:
            return True
        return assignee_user_id is None or assignee_user_id == self.user_id


class Registry:
    def __init__(self) -> None:
        self._agents: dict[int, set[Connection]] = defaultdict(set)
        self._visitors: dict[int, set[Connection]] = defaultdict(set)

    def join_agents(self, connection: Connection) -> None:
        self._agents[connection.workspace_id].add(connection)

    def leave_agents(self, connection: Connection) -> None:
        self._forget(self._agents, connection.workspace_id, connection)

    def join_visitors(self, connection: Connection) -> None:
        if connection.customer_id is not None:
            self._visitors[connection.customer_id].add(connection)

    def leave_visitors(self, connection: Connection) -> None:
        if connection.customer_id is not None:
            self._forget(self._visitors, connection.customer_id, connection)

    def to_agents(self, workspace_id: int, payload: dict, *, assignee_user_id: int | None) -> int:
        reached = 0
        for connection in list(self._agents.get(workspace_id, ())):
            if not connection.may_see(assignee_user_id):
                continue
            connection.offer(payload)
            reached += 1
        return reached

    def to_visitor(self, customer_id: int, payload: dict) -> int:
        reached = 0
        for connection in list(self._visitors.get(customer_id, ())):
            connection.offer(payload)
            reached += 1
        return reached

    @staticmethod
    def _forget(holders: dict[int, set[Connection]], key: int, connection: Connection) -> None:
        held = holders.get(key)
        if held is None:
            return
        held.discard(connection)
        if not held:
            holders.pop(key, None)


registry = Registry()


async def pump(connection: Connection) -> None:
    while True:
        payload = await connection.queue.get()
        await connection.socket.send_json(payload)
