from pydantic import BaseModel


class TicketOut(BaseModel):
    ticket: str
    expires_in: int
