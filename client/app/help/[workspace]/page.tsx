import { FileText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
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

/**
 * Rows with hairlines rather than cards. Twelve bordered boxes stacked
 * vertically is twelve competing rectangles; rows scan faster and let the
 * category headings do the grouping.
 */
function ArticleLink({ workspace, article }: { workspace: string; article: ArticleCard }) {
  return (
    <Link
      href={`/help/${workspace}/${article.slug}`}
      className="flex items-start gap-3 border-b border-line py-3.5 transition-colors last:border-b-0 hover:bg-brand-50/60"
    >
      <FileText className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{article.title}</span>
        {article.preview && (
          <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">
            {article.preview}
          </span>
        )}
      </span>
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
    <main className="min-h-svh bg-paper">
      {/* The only surface a stranger sees, so it is the one place allowed to be
          generous with space — and the one that needed a real masthead. */}
      <header className="border-b border-line bg-linear-to-b from-brand-50 to-paper">
        <div className="mx-auto max-w-[720px] px-5 py-10 sm:px-6 sm:py-14">
          <p className="mb-3.5 flex items-center gap-2.5 text-[13px] font-semibold text-brand-700">
            <BrandMark className="size-5 text-brand-500" />
            {site.workspace_name}
          </p>
          <h1 className="mb-4 text-[clamp(1.5rem,6vw,1.7rem)] leading-tight font-bold tracking-[-0.032em] text-brand-900">
            How can we help?
          </h1>

          <form action={`/help/${workspace}`} className="relative max-w-[520px]">
            <Search
              className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search for an answer…"
              aria-label="Search help articles"
              className="h-[46px] w-full rounded-full border border-line-input bg-surface pr-5 pl-12 text-[14.5px] shadow-e1 outline-none placeholder:text-ink-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-[720px] px-5 py-8 sm:px-6 sm:py-10">
        {searching && (
          <p className="mb-6 text-sm text-ink-500">
            {shown.length === 0
              ? `Nothing found for “${q}”.`
              : `${shown.length} result${shown.length === 1 ? "" : "s"} for “${q}”.`}
          </p>
        )}

        {!searching && site.articles.length === 0 && (
          <p className="text-sm text-ink-500">There are no published articles here yet.</p>
        )}

        <div className="space-y-9">
          {grouped.map(({ category, articles }) => (
            <section key={category.id}>
              <h2 className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.07em] text-ink-500 uppercase">
                {category.name}
                <span className="h-px flex-1 bg-line" />
              </h2>
              <div>
                {articles.map((article) => (
                  <ArticleLink key={article.slug} workspace={workspace} article={article} />
                ))}
              </div>
            </section>
          ))}

          {loose.length > 0 && (
            <section>
              {grouped.length > 0 && (
                <h2 className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.07em] text-ink-500 uppercase">
                  Everything else
                  <span className="h-px flex-1 bg-line" />
                </h2>
              )}
              <div>
                {loose.map((article) => (
                  <ArticleLink key={article.slug} workspace={workspace} article={article} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
