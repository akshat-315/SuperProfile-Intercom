import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type ArticleCard, fetchResults, fetchSite } from "@/lib/help";

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  const site = await fetchSite(workspace);
  if (site === null) return { title: "Help" };
  return {
    title: `${site.workspace_name} help centre`,
    description: `Answers and guides from ${site.workspace_name}.`,
  };
}

function Card({ workspace, article }: { workspace: string; article: ArticleCard }) {
  return (
    <Link
      href={`/help/${workspace}/${article.slug}`}
      className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <p className="font-medium">{article.title}</p>
      {article.preview && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.preview}</p>
      )}
    </Link>
  );
}

export default async function HelpCentre({ params, searchParams }: Props) {
  const { workspace } = await params;
  const { q } = await searchParams;

  const site = await fetchSite(workspace);
  if (site === null) notFound();

  const searching = (q ?? "").trim().length > 0;
  const results = searching ? await fetchResults(workspace, q ?? "") : null;
  const shown = results?.items ?? site.articles;

  const grouped = site.categories
    .map((category) => ({
      category,
      articles: shown.filter((a) => a.category_id === category.id),
    }))
    .filter((group) => group.articles.length > 0);
  const loose = shown.filter((a) => a.category_id === null);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 space-y-4">
        <p className="text-sm text-muted-foreground">{site.workspace_name}</p>
        <h1 className="text-3xl font-semibold tracking-tight">How can we help?</h1>

        <form action={`/help/${workspace}`} className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search for an answer…"
            aria-label="Search help articles"
            className="h-11 w-full rounded-full border bg-background pl-10 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      </header>

      {searching && (
        <p className="mb-6 text-sm text-muted-foreground">
          {shown.length === 0
            ? `Nothing found for “${q}”.`
            : `${shown.length} result${shown.length === 1 ? "" : "s"} for “${q}”.`}
        </p>
      )}

      {!searching && site.articles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          There are no published articles here yet.
        </p>
      )}

      <div className="space-y-10">
        {grouped.map(({ category, articles }) => (
          <section key={category.id} className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {category.name}
            </h2>
            <div className="space-y-2">
              {articles.map((article) => (
                <Card key={article.slug} workspace={workspace} article={article} />
              ))}
            </div>
          </section>
        ))}

        {loose.length > 0 && (
          <section className="space-y-3">
            {grouped.length > 0 && (
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Everything else
              </h2>
            )}
            <div className="space-y-2">
              {loose.map((article) => (
                <Card key={article.slug} workspace={workspace} article={article} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
