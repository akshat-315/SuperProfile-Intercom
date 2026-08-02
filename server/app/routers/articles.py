from fastapi import APIRouter, Query, status

from app.deps import InWorkspace
from app.models import Article, ArticleCategory
from app.schemas.articles import (
    ArticleDetail,
    ArticleList,
    ArticleRequest,
    ArticleRow,
    CategoryOut,
    CategoryRequest,
    Suggestion,
    SuggestionList,
)
from app.services import articles as service
from app.services import ratelimit
from app.services.html import clean, plain, to_text
from app.services.security import utcnow

router = APIRouter(prefix="/api/articles", tags=["articles"])

PICKER_RESULTS = 8


def suggestion_out(article: Article, score: float, workspace_slug: str) -> Suggestion:
    return Suggestion(
        id=article.id,
        title=article.title,
        slug=article.slug,
        url=service.public_url(workspace_slug, article.slug),
        score=score,
    )


def row_out(article: Article) -> ArticleRow:
    return ArticleRow(
        id=article.id,
        title=article.title,
        slug=article.slug,
        status=article.status,
        category_id=article.category_id,
        published_at=article.published_at,
        updated_at=article.updated_at,
    )


def detail_out(article: Article) -> ArticleDetail:
    return ArticleDetail(
        **row_out(article).model_dump(),
        body_html=article.body_html,
        body_text=article.body_text,
    )


def category_out(category: ArticleCategory) -> CategoryOut:
    return CategoryOut(
        id=category.id, name=category.name, slug=category.slug, position=category.position
    )


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(signed_in: InWorkspace) -> list[CategoryOut]:
    return [category_out(c) for c in await service.categories(signed_in.db)]


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def add_category(body: CategoryRequest, signed_in: InWorkspace) -> CategoryOut:
    assert signed_in.workspace is not None
    category = await service.add_category(
        signed_in.db, signed_in.workspace.id, name=body.name, position=body.position
    )
    await signed_in.db.commit()
    return category_out(category)


@router.get("/search", response_model=SuggestionList)
async def find_articles(
    signed_in: InWorkspace, q: str = Query(default="", max_length=300)
) -> SuggestionList:
    ratelimit.enforce(ratelimit.ARTICLE_SEARCH, str(signed_in.user.id))
    assert signed_in.workspace is not None
    found = await service.search(signed_in.db, q, limit=PICKER_RESULTS)
    return SuggestionList(
        items=[suggestion_out(a, score, signed_in.workspace.slug) for a, score in found]
    )


@router.get("", response_model=ArticleList)
async def list_articles(
    signed_in: InWorkspace, article_status: str | None = Query(default=None, alias="status")
) -> ArticleList:
    rows = await service.listing(signed_in.db, status=article_status)
    return ArticleList(items=[row_out(a) for a in rows])


@router.post("", response_model=ArticleDetail, status_code=status.HTTP_201_CREATED)
async def create_article(body: ArticleRequest, signed_in: InWorkspace) -> ArticleDetail:
    assert signed_in.workspace is not None
    if body.category_id is not None:
        await service.category_by_id(signed_in.db, body.category_id)

    safe = clean(body.body_html)
    article = await service.create(
        signed_in.db,
        signed_in.workspace.id,
        title=plain(body.title),
        body_html=safe,
        body_text=to_text(safe),
        category_id=body.category_id,
        author_user_id=signed_in.user.id,
    )
    await signed_in.db.commit()
    return detail_out(article)


@router.get("/{article_id}", response_model=ArticleDetail)
async def read_article(article_id: int, signed_in: InWorkspace) -> ArticleDetail:
    return detail_out(await service.by_id(signed_in.db, article_id))


@router.patch("/{article_id}", response_model=ArticleDetail)
async def edit_article(
    article_id: int, body: ArticleRequest, signed_in: InWorkspace
) -> ArticleDetail:
    article = await service.by_id(signed_in.db, article_id)
    if body.category_id is not None:
        await service.category_by_id(signed_in.db, body.category_id)

    safe = clean(body.body_html)
    await service.update(
        signed_in.db,
        article,
        title=plain(body.title),
        body_html=safe,
        body_text=to_text(safe),
        category_id=body.category_id,
        now=utcnow(),
    )
    await signed_in.db.commit()
    return detail_out(article)


@router.post("/{article_id}/publish", response_model=ArticleDetail)
async def publish_article(article_id: int, signed_in: InWorkspace) -> ArticleDetail:
    article = await service.by_id(signed_in.db, article_id)
    await service.publish(signed_in.db, article, utcnow())
    await signed_in.db.commit()
    return detail_out(article)


@router.post("/{article_id}/unpublish", response_model=ArticleDetail)
async def unpublish_article(article_id: int, signed_in: InWorkspace) -> ArticleDetail:
    article = await service.by_id(signed_in.db, article_id)
    await service.unpublish(signed_in.db, article, utcnow())
    await signed_in.db.commit()
    return detail_out(article)
