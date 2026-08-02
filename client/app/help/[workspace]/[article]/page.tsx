import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { fetchArticle, fetchSite } from "@/lib/help";

type Props = { params: Promise<{ workspace: string; article: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace, article } = await params;
  const found = await fetchArticle(workspace, article);
  if (found === null) return { title: "Help" };
  return { title: found.title };
}

export default async function HelpArticle({ params }: Props) {
  const { workspace, article } = await params;
  const [site, found] = await Promise.all([
    fetchSite(workspace),
    fetchArticle(workspace, article),
  ]);
  if (site === null || found === null) notFound();

  return (
    <main className="min-h-svh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[720px] items-center gap-2.5 px-5 py-3.5 sm:px-6">
          <BrandMark className="size-5 shrink-0 text-brand-500" />
          <Link
            href={`/help/${workspace}`}
            className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink-500 transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{site.workspace_name} help centre</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[720px] px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[clamp(1.4rem,5.5vw,1.7rem)] leading-tight font-bold tracking-[-0.032em] text-brand-900">
          {found.title}
        </h1>

        {/* The measure is capped even though the pane is wider — long lines are
            the fastest way to make good writing unreadable. */}
        <article
          className="mt-7 max-w-[72ch] space-y-4 text-[15px] leading-7 text-ink-700 [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:rounded-r-md [&_blockquote]:border-l-[3px] [&_blockquote]:border-brand-500 [&_blockquote]:bg-brand-50 [&_blockquote]:py-3 [&_blockquote]:pl-4 [&_blockquote]:text-brand-900 [&_h2]:mt-8 [&_h2]:text-[1.05rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.018em] [&_h2]:text-ink-900 [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-ink-900 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-4 [&_strong]:text-ink-900 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: found.body_html }}
        />
      </div>
    </main>
  );
}
