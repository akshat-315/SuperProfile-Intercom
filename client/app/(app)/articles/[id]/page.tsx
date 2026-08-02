"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { ArticleEditor } from "@/components/articles/editor";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { type Article, articles } from "@/lib/articles";

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
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to articles">
          <Link href="/articles">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-lg font-medium">
          {fresh ? "New article" : "Edit article"}
        </h1>
        {article && (
          <Badge variant={article.status === "published" ? "default" : "secondary"}>
            {article.status}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Do Kestrel boots run true to size?"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Article</Label>
        <ArticleEditor value={html} onChange={setHtml} />
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton busy={busy} onClick={save}>
          Save
        </SubmitButton>
        {article && (
          <Button variant="outline" disabled={busy} onClick={togglePublished}>
            {article.status === "published" ? "Move back to draft" : "Publish"}
          </Button>
        )}
        {article?.status === "published" && (
          <span className="text-xs text-muted-foreground">
            Live at /help/…/{article.slug}
          </span>
        )}
      </div>
    </div>
  );
}
