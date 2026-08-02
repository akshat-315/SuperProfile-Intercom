"use client";

import { Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Suggestion,
  type Summary,
  assistant,
  insertIntoReply,
} from "@/lib/articles";

const LABELS: [keyof Summary, string][] = [
  ["issue", "Problem"],
  ["intent", "Wants"],
  ["tried", "Tried"],
  ["status", "Now"],
];

function Results({ items }: { items: Suggestion[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing close enough to suggest.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => insertIntoReply(item.title)}
            className="w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted"
          >
            <span className="block font-medium leading-snug">{item.title}</span>
            <span className="text-[10px] text-muted-foreground">
              click to add to your reply
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Assistant({ conversationId }: { conversationId: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggested, setSuggested] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Suggestion[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setSuggested(null);
    setFound(null);
    setTerm("");
    setLoading(true);
    assistant
      .summary(conversationId, controller.signal)
      .then(setSummary)
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [conversationId]);

  async function suggest() {
    setBusy(true);
    try {
      setSuggested((await assistant.suggestions(conversationId)).items);
    } catch {
      setSuggested([]);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (!term.trim()) return;
    setFound((await assistant.find(term.trim())).items);
  }

  return (
    <>
      <Separator className="my-4" />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Summary</p>
        {loading && <Skeleton className="h-16 w-full" />}
        {!loading && summary === null && (
          <p className="text-xs text-muted-foreground">
            Not enough of a conversation to summarise yet.
          </p>
        )}
        {summary !== null && (
          <dl className="space-y-2 text-xs">
            {summary.product && (
              <p className="font-medium leading-snug">{summary.product}</p>
            )}
            {LABELS.map(([field, label]) =>
              summary[field] ? (
                <div key={field}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="leading-snug">{String(summary[field])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
      </div>

      <Separator className="my-4" />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Help articles</p>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={suggest}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {busy ? "Looking…" : "Suggest articles"}
        </Button>

        {suggested !== null && <Results items={suggested} />}

        <div className="flex gap-1.5 pt-1">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Find an article…"
            className="h-8 text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Search articles"
            onClick={search}
          >
            <Search className="size-3.5" aria-hidden />
          </Button>
        </div>

        {found !== null && <Results items={found} />}
      </div>
    </>
  );
}
