import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={`/help/${workspace}`}
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {site.workspace_name} help centre
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">{found.title}</h1>

      <article
        className="mt-8 space-y-4 text-[15px] leading-7 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: found.body_html }}
      />
    </main>
  );
}
