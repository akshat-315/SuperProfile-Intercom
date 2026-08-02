from app.logging import get_logger
from app.models import Conversation, Message
from app.services.connections import registry

log = get_logger(__name__)

MESSAGE = "message"
RESYNC = "resync"


def message_saved(conversation: Conversation, message: Message) -> None:
    payload = {"t": MESSAGE, "conversation": conversation.id, "seq": message.seq}
    try:
        registry.to_agents(
            conversation.workspace_id,
            payload,
            assignee_user_id=conversation.assignee_user_id,
        )
        registry.to_visitor(conversation.customer_id, payload)
    except Exception:
        log.exception("events.fanout_failed", conversation_id=conversation.id)
