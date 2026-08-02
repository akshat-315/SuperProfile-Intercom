from app.logging import get_logger
from app.models import Conversation, Message
from app.services.connections import registry

log = get_logger(__name__)

MESSAGE = "message"
RESYNC = "resync"
TYPING = "typing"
READ = "read"
ERROR = "error"

AGENT = "agent"
CUSTOMER = "customer"


def message_saved(conversation: Conversation, message: Message) -> None:
    payload = {"t": MESSAGE, "conversation": conversation.id, "seq": message.seq}
    _to_agents(conversation, payload)
    _to_visitor(conversation, payload)


def typing_changed(conversation: Conversation, *, who: str, name: str | None, on: bool) -> None:
    payload = {
        "t": TYPING,
        "conversation": conversation.id,
        "who": who,
        "name": name,
        "on": on,
    }
    if who == AGENT:
        _to_visitor(conversation, payload)
    else:
        _to_agents(conversation, payload)


def read_by(conversation: Conversation, *, who: str) -> None:
    payload = {"t": READ, "conversation": conversation.id, "who": who}
    if who == AGENT:
        _to_visitor(conversation, payload)
    else:
        _to_agents(conversation, payload)


def _to_agents(conversation: Conversation, payload: dict) -> None:
    try:
        registry.to_agents(
            conversation.workspace_id,
            payload,
            assignee_user_id=conversation.assignee_user_id,
        )
    except Exception:
        log.exception("events.fanout_failed", conversation_id=conversation.id, side=AGENT)


def _to_visitor(conversation: Conversation, payload: dict) -> None:
    try:
        registry.to_visitor(conversation.customer_id, payload)
    except Exception:
        log.exception("events.fanout_failed", conversation_id=conversation.id, side=CUSTOMER)
