"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { ArticleEditor } from "@/components/articles/editor";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { type Article, articles } from "@/lib/articles";
import { cn } from "@/lib/utils";

export default function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fresh = id === "new";

  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!fresh);

  useEffect(() => {
    if (fresh) return;
    const controller = new AbortController();
    articles
      .read(Number(id), controller.signal)
      .then((found) => {
        setArticle(found);
        setTitle(found.title);
        setHtml(found.body_html);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fresh, id]);

  async function save() {
    if (!title.trim()) {
      toast.error("Give it a title first.");
      return;
    }
    setBusy(true);
    try {
      const body = { title: title.trim(), body_html: html, category_id: null };
      if (fresh) {
        const made = await articles.create(body);
        toast.success("Saved as a draft");
        router.replace(`/articles/${made.id}`);
        return;
      }
      setArticle(await articles.update(Number(id), body));
      toast.success("Saved");
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    if (article === null) return;
    setBusy(true);
    try {
      const next =
        article.status === "published"
          ? await articles.unpublish(article.id)
          : await articles.publish(article.id);
      setArticle(next);
      toast.success(next.status === "published" ? "Published" : "Moved back to draft");
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not change that.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-8" aria-hidden>
        <div className="skeleton-sweep h-7 w-64 rounded-lg" />
        <div className="skeleton-sweep h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back to articles">
          <Link href="/articles">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.02em]">
          {fresh ? "New article" : "Edit article"}
        </h1>
        {article && (
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold",
              article.status === "published" ? "bg-done-bg text-done" : "bg-secondary text-ink-500",
            )}
          >
            {article.status === "published" ? "Published" : "Draft"}
          </span>
        )}
      </div>

      {/* A borderless 26px title field, so writing feels like writing rather
          than filling in a form. */}
      <div className="space-y-1.5">
        <Label htmlFor="title" className="sr-only">
          Title
        </Label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Do Kestrel boots run true to size?"
          className="w-full border-0 bg-transparent text-[26px] leading-tight font-semibold tracking-[-0.03em] outline-none placeholder:text-ink-400 focus-visible:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="sr-only">Article</Label>
        <ArticleEditor value={html} onChange={setHtml} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton busy={busy} onClick={save} size="lg">
          Save
        </SubmitButton>
        {article && (
          <Button variant="outline" size="lg" disabled={busy} onClick={togglePublished}>
            {article.status === "published" ? "Move back to draft" : "Publish"}
          </Button>
        )}
        {article?.status === "published" && (
          <span className="min-w-0 truncate text-xs text-ink-500">
            Live at /help/…/{article.slug}
          </span>
        )}
      </div>
    </div>
  );
}
