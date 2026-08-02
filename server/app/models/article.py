from typing import Literal, get_args

from sqlalchemy import (
    BigInteger,
    Computed,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id, Timestamp

ArticleStatus = Literal["draft", "published"]
ARTICLE_STATUSES: tuple[str, ...] = get_args(ArticleStatus)
DRAFT: ArticleStatus = "draft"
PUBLISHED: ArticleStatus = "published"

SEARCH_EXPRESSION = (
    "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(body_text, '')), 'B')"
)


class ArticleCategory(HasWorkspaceId, BaseTable):
    __tablename__ = "article_categories"
    __table_args__ = (UniqueConstraint("workspace_id", "slug", name="uq_category_slug"),)

    id: Mapped[Id]
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Article(HasWorkspaceId, BaseTable):
    __tablename__ = "articles"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_article_slug"),
        Index(
            "ix_articles_search",
            "search",
            postgresql_using="gin",
            postgresql_where=text("status = 'published'"),
        ),
    )

    id: Mapped[Id]
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("article_categories.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=DRAFT)
    published_at: Mapped[Timestamp | None]
    author_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[Timestamp] = mapped_column(server_default=func.now())
    search: Mapped[str] = mapped_column(
        TSVECTOR, Computed(SEARCH_EXPRESSION, persisted=True), nullable=True
    )
