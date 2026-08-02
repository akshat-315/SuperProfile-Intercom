"""help articles and categories

Revision ID: 7e19ab1cb5b6
Revises: b7383e61e6ba
Create Date: 2026-08-02 14:00:24.100103

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7e19ab1cb5b6"
down_revision: str | Sequence[str] | None = "b7383e61e6ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEARCH_EXPRESSION = (
    "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(body_text, '')), 'B')"
)


def upgrade() -> None:
    op.create_table(
        "article_categories",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("workspace_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "slug", name="uq_category_slug"),
    )
    op.create_index(
        op.f("ix_article_categories_workspace_id"),
        "article_categories",
        ["workspace_id"],
        unique=False,
    )

    op.create_table(
        "articles",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("category_id", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("author_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(SEARCH_EXPRESSION, persisted=True),
            nullable=True,
        ),
        sa.Column("workspace_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["category_id"], ["article_categories.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "slug", name="uq_article_slug"),
    )
    op.create_index(op.f("ix_articles_category_id"), "articles", ["category_id"], unique=False)
    op.create_index(op.f("ix_articles_workspace_id"), "articles", ["workspace_id"], unique=False)
    op.create_index(
        "ix_articles_search",
        "articles",
        ["search"],
        unique=False,
        postgresql_using="gin",
        postgresql_where=sa.text("status = 'published'"),
    )


def downgrade() -> None:
    op.drop_index("ix_articles_search", table_name="articles", postgresql_using="gin")
    op.drop_index(op.f("ix_articles_workspace_id"), table_name="articles")
    op.drop_index(op.f("ix_articles_category_id"), table_name="articles")
    op.drop_table("articles")
    op.drop_index(op.f("ix_article_categories_workspace_id"), table_name="article_categories")
    op.drop_table("article_categories")
