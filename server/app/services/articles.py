import re
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import DRAFT, INBOUND, PUBLISHED, Article, ArticleCategory, Message
from app.services.security import slugify

log = get_logger(__name__)

NOT_FOUND = "That article could not be found."
CATEGORY_NOT_FOUND = "That category could not be found."
TERM = re.compile(r"[a-z0-9]{2,}")
MAX_TERMS = 40
FLOOR = 0.05
SUGGESTIONS = 3
RECENT_CUSTOMER_MESSAGES = 5


def not_found(message: str = NOT_FOUND) -> AppError:
    return AppError("not_found", message, status_code=404)


async def free_slug(db: AsyncSession, table, wanted: str, *, ignoring: int | None = None) -> str:
    stem = slugify(wanted, fallback="article")
    query = select(table.slug).where(table.slug.like(f"{stem}%"))
    if ignoring is not None:
        query = query.where(table.id != ignoring)
    taken = set(await db.scalars(query))
    if stem not in taken:
        return stem
    suffix = 2
    while f"{stem}-{suffix}" in taken:
        suffix += 1
    return f"{stem}-{suffix}"


async def categories(db: AsyncSession) -> list[ArticleCategory]:
    return list(
        await db.scalars(
            select(ArticleCategory).order_by(ArticleCategory.position, ArticleCategory.name)
        )
    )


async def add_category(
    db: AsyncSession, workspace_id: int, *, name: str, position: int
) -> ArticleCategory:
    category = ArticleCategory(
        workspace_id=workspace_id,
        name=name.strip(),
        slug=await free_slug(db, ArticleCategory, name),
        position=position,
    )
    db.add(category)
    await db.flush()
    return category


async def category_by_id(db: AsyncSession, category_id: int) -> ArticleCategory:
    found = await db.scalar(select(ArticleCategory).where(ArticleCategory.id == category_id))
    if found is None:
        raise not_found(CATEGORY_NOT_FOUND)
    return found


async def listing(db: AsyncSession, *, status: str | None = None) -> list[Article]:
    query = select(Article).order_by(Article.updated_at.desc())
    if status is not None:
        query = query.where(Article.status == status)
    return list(await db.scalars(query))


async def by_id(db: AsyncSession, article_id: int) -> Article:
    found = await db.scalar(select(Article).where(Article.id == article_id))
    if found is None:
        raise not_found()
    return found


async def by_slug(db: AsyncSession, slug: str, *, published_only: bool = True) -> Article:
    query = select(Article).where(Article.slug == slug)
    if published_only:
        query = query.where(Article.status == PUBLISHED)
    found = await db.scalar(query)
    if found is None:
        raise not_found()
    return found


async def create(
    db: AsyncSession,
    workspace_id: int,
    *,
    title: str,
    body_html: str,
    body_text: str,
    category_id: int | None,
    author_user_id: int,
) -> Article:
    article = Article(
        workspace_id=workspace_id,
        title=title.strip(),
        slug=await free_slug(db, Article, title),
        body_html=body_html,
        body_text=body_text,
        category_id=category_id,
        status=DRAFT,
        author_user_id=author_user_id,
    )
    db.add(article)
    await db.flush()
    return article


async def update(
    db: AsyncSession,
    article: Article,
    *,
    title: str | None,
    body_html: str | None,
    body_text: str | None,
    category_id: int | None,
    now: datetime,
) -> Article:
    if title is not None and title.strip() != article.title:
        article.title = title.strip()
        article.slug = await free_slug(db, Article, title, ignoring=article.id)
    if body_html is not None:
        article.body_html = body_html
    if body_text is not None:
        article.body_text = body_text
    article.category_id = category_id
    article.updated_at = now
    await db.flush()
    return article


async def publish(db: AsyncSession, article: Article, now: datetime) -> Article:
    article.status = PUBLISHED
    article.published_at = article.published_at or now
    article.updated_at = now
    await db.flush()
    return article


async def unpublish(db: AsyncSession, article: Article, now: datetime) -> Article:
    article.status = DRAFT
    article.updated_at = now
    await db.flush()
    return article


def terms(text: str) -> list[str]:
    found = TERM.findall(text.lower())
    seen: dict[str, None] = {}
    for word in found:
        seen.setdefault(word, None)
    return list(seen)[:MAX_TERMS]


async def suggest(db: AsyncSession, conversation_id: int) -> list[tuple[Article, float]]:
    from app.services import summaries

    asked = list(
        await db.scalars(
            select(Message.body_text)
            .where(Message.conversation_id == conversation_id, Message.direction == INBOUND)
            .order_by(Message.seq.desc())
            .limit(RECENT_CUSTOMER_MESSAGES)
        )
    )
    if not asked:
        return []

    state = await summaries.state_of(db, conversation_id)
    latest = asked[0] if state is not None else " ".join(asked)
    return await search(db, summaries.search_text(state, latest))


async def search(
    db: AsyncSession, text: str, *, limit: int = SUGGESTIONS
) -> list[tuple[Article, float]]:
    words = terms(text)
    if not words:
        return []

    query = func.to_tsquery("english", " | ".join(words))
    rank = func.ts_rank_cd(Article.search, query)
    rows = (
        await db.execute(
            select(Article, rank.label("score"))
            .where(Article.status == PUBLISHED, Article.search.op("@@")(query))
            .order_by(rank.desc())
            .limit(limit)
        )
    ).all()
    return [(article, float(score)) for article, score in rows if float(score) >= FLOOR]
