"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { type ArticleRow, articles } from "@/lib/articles";
import { whenLabel } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export default function ArticlesPage() {
  const [rows, setRows] = useState<ArticleRow[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    articles
      .list(undefined, controller.signal)
      .then((page) => setRows(page.items))
      .catch(() => {
        if (!controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.024em]">Help articles</h1>
          <p className="text-sm text-ink-500">Answers your customers can read without asking.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/articles/new">
            <Plus className="size-4" aria-hidden />
            Write one
          </Link>
        </Button>
      </div>

      {rows === null && (
        <div className="flex flex-col" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="skeleton-sweep h-3 w-1/2 rounded-full" />
                <div className="skeleton-sweep h-2.5 w-1/3 rounded-full" />
              </div>
              <div className="skeleton-sweep h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {rows?.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 text-center">
          <FileText className="size-11 text-brand-200" strokeWidth={1.5} aria-hidden />
          <p className="font-semibold">No articles yet</p>
          <p className="max-w-[34ch] text-sm text-ink-500">
            Write the answer you type most often.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link href="/articles/new">Write the first one</Link>
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows?.map((row) => (
          <Link
            key={row.id}
            href={`/articles/${row.id}`}
            className="flex min-h-14 items-center gap-3 border-b border-line py-3 transition-colors hover:bg-brand-50/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="truncate text-xs text-ink-500">/{row.slug}</p>
            </div>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold",
                row.status === "published"
                  ? "bg-done-bg text-done"
                  : "bg-secondary text-ink-500",
              )}
            >
              {row.status === "published" ? "Published" : "Draft"}
            </span>
            <time
              dateTime={row.updated_at}
              className="w-12 shrink-0 text-right text-[11.5px] text-ink-500"
            >
              {whenLabel(row.updated_at)}
            </time>
          </Link>
        ))}
      </div>
    </div>
  );
}
