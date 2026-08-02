from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import PUBLISHED, Article, ArticleCategory, Workspace
from app.services.articles import terms
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

NO_SITE = "There is no help centre here."
RESULTS = 10


def no_site() -> AppError:
    return AppError("not_found", NO_SITE, status_code=404)


async def by_hostname(db: AsyncSession, host: str) -> Workspace | None:
    return None


async def resolve(db: AsyncSession, *, host: str | None, slug: str | None) -> Workspace:
    with all_workspaces(reason="a help centre is public and names its own workspace"):
        if host:
            found = await by_hostname(db, host.split(":")[0].lower())
            if found is not None:
                return found
        if slug:
            found = await db.scalar(select(Workspace).where(Workspace.slug == slug.lower()))
            if found is not None:
                return found
    raise no_site()


async def categories(db: AsyncSession) -> list[ArticleCategory]:
    return list(
        await db.scalars(
            select(ArticleCategory).order_by(ArticleCategory.position, ArticleCategory.name)
        )
    )


async def published(db: AsyncSession) -> list[Article]:
    return list(
        await db.scalars(select(Article).where(Article.status == PUBLISHED).order_by(Article.title))
    )


async def article(db: AsyncSession, slug: str) -> Article:
    found = await db.scalar(
        select(Article).where(Article.slug == slug, Article.status == PUBLISHED)
    )
    if found is None:
        raise AppError("not_found", "That article could not be found.", status_code=404)
    return found


async def find(db: AsyncSession, text: str) -> list[Article]:
    words = terms(text)
    if not words:
        return []

    query = func.to_tsquery("english", " | ".join(words))
    rank = func.ts_rank_cd(Article.search, query)
    return list(
        await db.scalars(
            select(Article)
            .where(Article.status == PUBLISHED, Article.search.op("@@")(query))
            .order_by(rank.desc())
            .limit(RESULTS)
        )
    )
