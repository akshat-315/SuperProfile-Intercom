from fastapi import APIRouter, Request, Response, status

from app.db import SessionDep
from app.logging import get_logger
from app.services import inbound

log = get_logger(__name__)

router = APIRouter(prefix="/hooks", tags=["hooks"])


@router.post("/email")
async def inbound_email(request: Request, db: SessionDep) -> Response:
    raw = await request.body()

    if not inbound.authentic(raw, dict(request.headers)):
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)

    delivery = inbound.delivery(raw)
    if delivery is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    email_id, message_id = delivery
    if message_id is not None and await inbound.already_stored(db, message_id):
        log.info("inbound.already_stored", message_id=message_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        await inbound.accept(db, email_id)
        await db.commit()
    except Exception:
        await db.rollback()
        log.exception("inbound.not_queued", email_id=email_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
