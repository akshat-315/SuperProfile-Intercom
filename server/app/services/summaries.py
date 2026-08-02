import json
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logging import get_logger
from app.models import (
    INBOUND,
    KEYWORDS,
    SUMMARY_FIELDS,
    Conversation,
    ConversationState,
    Job,
    Message,
)
from app.models import PENDING as JOB_PENDING
from app.services import events, jobs
from app.services.security import utcnow
from app.workspace_filter import all_workspaces, use_workspace

log = get_logger(__name__)

REFRESH = "summary.refresh"
QUIET_SECONDS = 30
ENOUGH_NEW_MESSAGES = 1
BATCH_LIMIT = 60
KEYWORD_LIMIT = 16
TIMEOUT_SECONDS = 30.0

SHAPE = {
    "type": "object",
    "properties": {
        "product": {"type": "string"},
        "issue": {"type": "string"},
        "intent": {"type": "string"},
        "tried": {"type": "string"},
        "status": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["product", "issue", "intent", "tried", "status", "keywords"],
    "additionalProperties": False,
}

INSTRUCTIONS = (
    "You maintain the running state of a customer support conversation.\n"
    "You are given the state so far and only the messages that arrived since.\n"
    "Update the state; do not start again. Keep anything still true.\n\n"
    "product  - what the customer is asking about, in their words. Empty if unclear.\n"
    "issue    - the problem, in one short phrase.\n"
    "intent   - what the customer is trying to achieve.\n"
    "tried    - what has already been suggested or done, newest last.\n"
    "status   - where it stands right now.\n"
    "keywords - search terms for finding help articles. Include the words the\n"
    "           customer used AND obvious synonyms a help article might use\n"
    "           instead (shoe/boot, refund/return, delivery/shipping). Single\n"
    "           words, lower case, no duplicates.\n\n"
    "Be terse. These are read at a glance, not as prose."
)


class SummaryUnavailable(Exception):
    pass


async def schedule(db: AsyncSession, conversation: Conversation, *, soon: bool = False) -> None:
    if not settings.summaries_configured:
        return

    with all_workspaces(reason="a job row is looked up by its own payload"):
        already = await db.scalar(
            select(Job.id).where(
                Job.kind == REFRESH,
                Job.status == JOB_PENDING,
                Job.payload["conversation_id"].astext == str(conversation.id),
            )
        )
    if already is not None:
        return

    run_at = utcnow() if soon else utcnow() + timedelta(seconds=QUIET_SECONDS)
    await jobs.enqueue(
        db,
        kind=REFRESH,
        payload={"conversation_id": conversation.id},
        run_at=run_at,
        workspace_id=conversation.workspace_id,
    )


async def state_of(db: AsyncSession, conversation_id: int) -> ConversationState | None:
    return await db.scalar(
        select(ConversationState).where(ConversationState.conversation_id == conversation_id)
    )


def search_text(state: ConversationState | None, latest: str) -> str:
    if state is None:
        return latest

    words = state.state.get(KEYWORDS)
    parts = [" ".join(words[:KEYWORD_LIMIT])] if isinstance(words, list) else []
    parts += [str(state.state.get(field) or "") for field in ("product", "issue", "intent")]
    parts.append(latest)
    return " ".join(part for part in parts if part).strip()


async def ask_azure(state: dict, transcript: str) -> dict:
    if not settings.summaries_configured:
        raise SummaryUnavailable("azure openai is not configured")

    so_far = json.dumps(state or {}, indent=2)
    payload = {
        "messages": [
            {"role": "system", "content": INSTRUCTIONS},
            {
                "role": "user",
                "content": f"State so far:\n{so_far}\n\nNew messages:\n{transcript}",
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "conversation_state", "schema": SHAPE, "strict": True},
        },
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.azure_chat_url,
                headers={"api-key": settings.azure_openai_api_key},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise SummaryUnavailable(f"{type(exc).__name__}: {exc}") from exc

    if response.status_code >= 400:
        raise SummaryUnavailable(f"azure returned {response.status_code}: {response.text[:200]}")

    body = response.json()
    try:
        return json.loads(body["choices"][0]["message"]["content"])
    except (KeyError, IndexError, ValueError, TypeError) as exc:
        raise SummaryUnavailable(f"unreadable response: {type(exc).__name__}") from exc


def tidy(returned: dict) -> dict:
    kept = {field: str(returned.get(field) or "").strip() for field in SUMMARY_FIELDS}
    words = returned.get(KEYWORDS)
    seen: dict[str, None] = {}
    if isinstance(words, list):
        for word in words:
            cleaned = str(word).strip().lower()
            if cleaned.isalnum():
                seen.setdefault(cleaned, None)
    kept[KEYWORDS] = list(seen)[:KEYWORD_LIMIT]
    return kept


@jobs.handles(REFRESH)
async def refresh(db: AsyncSession, job: Job) -> None:
    conversation_id = job.payload.get("conversation_id")
    if not conversation_id or not settings.summaries_configured:
        return

    with all_workspaces(reason="the job carries its own workspace id"):
        conversation = await db.scalar(
            select(Conversation).where(Conversation.id == conversation_id)
        )
    if conversation is None:
        log.info("summary.conversation_gone", job_id=job.id)
        return

    with use_workspace(conversation.workspace_id):
        existing = await state_of(db, conversation.id)
        since = existing.last_seq if existing else 0

        waiting = await db.scalar(
            select(func.count(Message.id)).where(
                Message.conversation_id == conversation.id, Message.seq > since
            )
        )
        if (waiting or 0) < ENOUGH_NEW_MESSAGES:
            log.debug("summary.not_enough_yet", conversation_id=conversation.id, waiting=waiting)
            return

        fresh = list(
            await db.scalars(
                select(Message)
                .where(Message.conversation_id == conversation.id, Message.seq > since)
                .order_by(Message.seq)
                .limit(BATCH_LIMIT)
            )
        )

    transcript = "\n".join(
        f"{'customer' if m.direction == INBOUND else 'agent'}: {m.body_text}" for m in fresh
    )
    returned = await ask_azure(existing.state if existing else {}, transcript)
    kept = tidy(returned)
    reached = fresh[-1].seq

    with use_workspace(conversation.workspace_id):
        row = existing or ConversationState(
            conversation_id=conversation.id, workspace_id=conversation.workspace_id
        )
        row.state = kept
        row.last_seq = reached
        row.model = settings.azure_openai_deployment
        row.updated_at = utcnow()
        db.add(row)
        await db.commit()

    events.summary_ready(conversation)
    log.info("summary.updated", conversation_id=conversation.id, through_seq=reached)
