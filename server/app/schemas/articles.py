from datetime import datetime

from pydantic import BaseModel, Field


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    position: int


class CategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    position: int = 0


class ArticleRow(BaseModel):
    id: int
    title: str
    slug: str
    status: str
    category_id: int | None
    published_at: datetime | None
    updated_at: datetime


class ArticleDetail(ArticleRow):
    body_html: str
    body_text: str


class ArticleList(BaseModel):
    items: list[ArticleRow]


class ArticleRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_html: str = Field(default="", max_length=200_000)
    category_id: int | None = None


class Suggestion(BaseModel):
    id: int
    title: str
    slug: str
    url: str
    score: float


class SuggestionList(BaseModel):
    items: list[Suggestion]


class SummaryOut(BaseModel):
    product: str = ""
    issue: str = ""
    intent: str = ""
    tried: str = ""
    status: str = ""
    through_seq: int = 0
    updated_at: datetime | None = None
