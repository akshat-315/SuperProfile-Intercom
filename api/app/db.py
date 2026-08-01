from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def _connect_args() -> dict:
    if "pooler.supabase.com" in settings.database_url:
        return {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
    return {}


engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=_connect_args(),
)

session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


SessionDep = Annotated[AsyncSession, Depends(get_session)]
