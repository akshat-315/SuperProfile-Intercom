import random
from datetime import timedelta

from fastapi import APIRouter, status

from app.config import settings
from app.deps import InWorkspace
from app.errors import AppError
from app.models import CHAT, EMAIL, INBOUND, OPEN, OUTBOUND, Conversation, Customer, Message
from app.services.security import utcnow
from app.workspace_filter import require_workspace_id

router = APIRouter(prefix="/api/dev", tags=["dev"])

PEOPLE = [
    ("Sofia Marchetti", "sofia@example.com"),
    ("Daniel Okonkwo", "daniel.okonkwo@fastmail.com"),
    ("Priya Raman", "priya@example.org"),
    ("Tom Whitaker", None),
    ("Yuki Tanaka", "yuki@example.net"),
    ("Aisha Bello", "aisha@example.com"),
    ("Marco Rossi", None),
]

THREADS = [
    ("Is the Guji Highland still available in 1kg?", CHAT, [
        ("in", "Hi, is the Guji Highland still available in 1kg bags?"),
        ("out", "Hello! Let me check the roastery stock for you."),
        ("in", "Thanks, no rush."),
    ]),
    ("Grinder recommendation", EMAIL, [
        ("in", "I bought the Encore last year and it is struggling with espresso. What would you suggest?"),
        ("out", "The Encore really is a filter grinder. For espresso I would look at the Vario."),
        ("in", "Does the Vario hold its setting between drinks?"),
    ]),
    ("Order 4182 arrived damaged", EMAIL, [
        ("in", "The box was crushed and one bag had split. Photos attached."),
        ("out", "I am sorry about that. I have put a replacement on today's courier run."),
    ]),
    ("Subscription pause", CHAT, [
        ("in", "Can I pause my subscription for three weeks? Going away."),
    ]),
    ("Wrong grind size", CHAT, [
        ("in", "I ordered whole bean but got pre ground."),
        ("out", "That is our mistake. Replacement is going out today, keep the ground bag."),
        ("in", "Thank you, that is very fair."),
    ]),
    ("Do you ship to Ireland?", CHAT, [
        ("in", "Do you ship to Ireland, and how long does it take?"),
    ]),
    ("Invoice for October", EMAIL, [
        ("in", "Could you send a VAT invoice for October please?"),
        ("out", "Attached. Let me know if you need it addressed differently."),
    ]),
]


@router.post("/seed", status_code=status.HTTP_201_CREATED)
async def seed(signed_in: InWorkspace) -> dict[str, int]:
    if settings.is_production:
        raise AppError("not_available", "Not available here.", status_code=404)

    workspace_id = require_workspace_id()
    now = utcnow()
    random.seed(workspace_id)

    made = 0
    for index, (subject, channel, script) in enumerate(THREADS):
        name, email = PEOPLE[index % len(PEOPLE)]
        customer = Customer(
            workspace_id=workspace_id,
            name=name,
            email=email,
            visitor_id=None if email else f"seed-{workspace_id}-{index}",
        )
        signed_in.db.add(customer)
        await signed_in.db.flush()

        started = now - timedelta(hours=random.randint(1, 96))
        conversation = Conversation(
            workspace_id=workspace_id,
            customer_id=customer.id,
            channel=channel,
            status=OPEN,
            subject=subject if channel == EMAIL else None,
            assignee_user_id=signed_in.user.id if index % 3 == 0 else None,
            last_message_at=started,
        )
        signed_in.db.add(conversation)
        await signed_in.db.flush()

        for seq, (side, text) in enumerate(script, start=1):
            at = started - timedelta(minutes=(len(script) - seq) * 7)
            signed_in.db.add(
                Message(
                    workspace_id=workspace_id,
                    conversation_id=conversation.id,
                    seq=seq,
                    direction=INBOUND if side == "in" else OUTBOUND,
                    author_user_id=None if side == "in" else signed_in.user.id,
                    body_text=text,
                    read_at=None if side == "in" else at,
                    created_at=at,
                )
            )
        conversation.last_message_at = started
        made += 1

    if len(THREADS) > 5:
        pass

    await signed_in.db.commit()
    return {"conversations": made}
