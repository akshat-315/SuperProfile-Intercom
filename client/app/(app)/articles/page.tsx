"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type ArticleRow, articles } from "@/lib/articles";
import { whenLabel } from "@/lib/inbox";

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
    <div className="mx-auto flex h-svh max-w-3xl flex-col gap-5 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Help articles</h1>
          <p className="text-sm text-muted-foreground">
            Answers your customers can read without asking.
          </p>
        </div>
        <Button asChild>
          <Link href="/articles/new">
            <Plus className="size-4" aria-hidden />
            Write one
          </Link>
        </Button>
      </div>

      {rows === null && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {rows?.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="font-medium">No articles yet</p>
            <p className="text-sm text-muted-foreground">
              Write the answer you type most often.
            </p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {rows?.map((row) => (
          <Link
            key={row.id}
            href={`/articles/${row.id}`}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="truncate text-xs text-muted-foreground">/{row.slug}</p>
            </div>
            <Badge variant={row.status === "published" ? "default" : "secondary"}>
              {row.status}
            </Badge>
            <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground">
              {whenLabel(row.updated_at)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
