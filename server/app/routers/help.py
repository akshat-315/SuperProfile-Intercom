from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.db import SessionDep
from app.deps import client_ip
from app.models import Article
from app.services import help as service
from app.services import ratelimit
from app.workspace_filter import use_workspace

router = APIRouter(prefix="/api/help", tags=["help"])

PREVIEW_LENGTH = 180


class ArticleCard(BaseModel):
    title: str
    slug: str
    preview: str
    category_id: int | None


class CategoryBlock(BaseModel):
    id: int
    name: str
    slug: str


class SiteOut(BaseModel):
    workspace_name: str
    workspace_slug: str
    categories: list[CategoryBlock]
    articles: list[ArticleCard]


class ArticleOut(BaseModel):
    title: str
    slug: str
    body_html: str
    published_at: str | None


class ResultsOut(BaseModel):
    query: str
    items: list[ArticleCard]


def card(article: Article) -> ArticleCard:
    return ArticleCard(
        title=article.title,
        slug=article.slug,
        preview=article.body_text[:PREVIEW_LENGTH],
        category_id=article.category_id,
    )


async def site_for(request: Request, db: SessionDep, slug: str | None):
    ratelimit.enforce(ratelimit.HELP_PUBLIC, client_ip(request))
    return await service.resolve(db, host=request.headers.get("x-help-host"), slug=slug)


@router.get("/site", response_model=SiteOut)
async def read_site(
    request: Request, db: SessionDep, slug: str | None = Query(default=None)
) -> SiteOut:
    workspace = await site_for(request, db, slug)
    with use_workspace(workspace.id):
        blocks = await service.categories(db)
        articles = await service.published(db)

    return SiteOut(
        workspace_name=workspace.name,
        workspace_slug=workspace.slug,
        categories=[CategoryBlock(id=c.id, name=c.name, slug=c.slug) for c in blocks],
        articles=[card(a) for a in articles],
    )


@router.get("/article/{article_slug}", response_model=ArticleOut)
async def read_article(
    request: Request,
    article_slug: str,
    db: SessionDep,
    slug: str | None = Query(default=None),
) -> ArticleOut:
    workspace = await site_for(request, db, slug)
    with use_workspace(workspace.id):
        found = await service.article(db, article_slug)

    return ArticleOut(
        title=found.title,
        slug=found.slug,
        body_html=found.body_html,
        published_at=found.published_at.isoformat() if found.published_at else None,
    )


@router.get("/search", response_model=ResultsOut)
async def search_site(
    request: Request,
    db: SessionDep,
    q: str = Query(default="", max_length=300),
    slug: str | None = Query(default=None),
) -> ResultsOut:
    workspace = await site_for(request, db, slug)
    with use_workspace(workspace.id):
        found = await service.find(db, q)
    return ResultsOut(query=q, items=[card(a) for a in found])
