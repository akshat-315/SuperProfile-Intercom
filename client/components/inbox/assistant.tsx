"use client";

import { Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Suggestion, type Summary, assistant, insertIntoReply } from "@/lib/articles";
import { PRESENCE } from "@/lib/socket";
import { cn } from "@/lib/utils";

const LABELS: [keyof Summary, string][] = [
  ["issue", "Problem"],
  ["intent", "Wants"],
  ["tried", "Tried"],
  ["status", "Now"],
];

function Panel({
  title,
  aside,
  tone = "plain",
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  tone?: "plain" | "brand";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border p-3.5",
        tone === "brand" ? "border-brand-100 bg-brand-50" : "border-line bg-surface",
        className,
      )}
    >
      <h3
        className={cn(
          "mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] uppercase",
          tone === "brand" ? "text-brand-700" : "text-ink-500",
        )}
      >
        {tone === "brand" && <Sparkles className="size-3.5" aria-hidden />}
        {title}
        {aside !== undefined && (
          <span className="ml-auto text-[11px] font-medium tracking-normal normal-case text-ink-400">
            {aside}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/**
 * Relevance as a three-band meter plus the number itself. An agent about to
 * paste a link to a customer needs to know whether this was the strong match or
 * the weak one — the API has always returned `score` and the UI used to throw
 * it away. The numeral is there so the meter is never the only signal.
 *
 * The meter is scaled against the best match in the same result set rather than
 * against a fixed ceiling: the API's score is a search rank on no published
 * scale, so anything absolute would be a number we made up.
 */
function Relevance({ score, top }: { score: number; top: number }) {
  const share = top > 0 ? score / top : 0;
  const bands = share >= 0.85 ? 3 : share >= 0.6 ? 2 : 1;
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "block h-1 w-[15px] rounded-sm",
              i < bands ? "bg-brand-500" : "bg-brand-100",
            )}
          />
        ))}
      </span>
      <span data-numeric className="font-mono text-[11px] font-semibold text-ink-500">
        {score.toFixed(2)}
      </span>
      <span className="sr-only">relevance</span>
    </span>
  );
}

function Results({ items }: { items: Suggestion[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-ink-500">Nothing close enough to suggest.</p>;
  }
  const top = Math.max(...items.map((item) => item.score));
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => insertIntoReply(item.url)}
            title="Add this link to your reply"
            className="flex w-full min-w-0 flex-col gap-2 rounded-md border border-line bg-surface px-2.5 py-2.5 text-left transition-colors duration-[120ms] ease-harbour hover:border-brand-200 hover:bg-brand-50"
          >
            <span className="text-[12.5px] leading-snug font-medium text-ink-900">
              {item.title}
            </span>
            <Relevance score={item.score} top={top} />
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

  const load = useCallback(
    (signal?: AbortSignal) =>
      assistant
        .summary(conversationId, signal)
        .then(setSummary)
        .catch(() => undefined)
        .finally(() => setLoading(false)),
    [conversationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setSuggested(null);
    setFound(null);
    setTerm("");
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [conversationId, load]);

  useEffect(() => {
    const ready = (event: Event) => {
      const signal = (event as CustomEvent<{ t: string; conversation: number }>).detail;
      if (signal.t === "summary" && signal.conversation === conversationId) void load();
    };
    window.addEventListener(PRESENCE, ready);
    return () => window.removeEventListener(PRESENCE, ready);
  }, [conversationId, load]);

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

  const updated = summary?.updated_at ? new Date(summary.updated_at) : null;

  return (
    <>
      <Panel title="Summary" tone="brand" aside="auto">
        {loading && (
          <div className="flex flex-col gap-2.5" aria-hidden>
            <div className="skeleton-sweep h-3 w-1/2 rounded-full" />
            <div className="skeleton-sweep h-2.5 w-full rounded-full" />
            <div className="skeleton-sweep h-2.5 w-4/5 rounded-full" />
          </div>
        )}

        {!loading && summary === null && (
          <p className="rounded-md border border-dashed border-brand-200 px-3 py-3 text-xs leading-relaxed text-brand-700">
            Not enough of a conversation to summarise yet.
          </p>
        )}

        {summary !== null && (
          <>
            {summary.product && (
              <p className="mb-3 text-[13.5px] leading-snug font-semibold text-brand-900">
                {summary.product}
              </p>
            )}
            <dl className="flex flex-col gap-2.5">
              {LABELS.map(([field, label]) =>
                summary[field] ? (
                  <div key={field}>
                    <dt className="mb-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-brand-700/75 uppercase">
                      {label}
                    </dt>
                    <dd className="text-[13px] leading-relaxed text-brand-900">
                      {String(summary[field])}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
            {updated !== null && (
              <p className="mt-3 border-t border-brand-100 pt-2.5 text-[11px] text-brand-700/70">
                Summarised through message {summary.through_seq} · updated{" "}
                {updated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="Suggested articles"
        aside={found === null && suggested !== null ? suggested.length : undefined}
      >
        <Button
          variant="outline"
          size="sm"
          className="mb-2.5 w-full"
          disabled={busy}
          onClick={suggest}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {busy ? "Looking…" : "Suggest articles"}
        </Button>

        {found === null && suggested !== null && <Results items={suggested} />}

        <div className="flex gap-1.5 pt-2.5">
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              if (!e.target.value.trim()) setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Find an article…"
            aria-label="Find an article"
            className="h-8.5 text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8.5 shrink-0"
            aria-label="Search articles"
            onClick={search}
          >
            <Search className="size-3.5" aria-hidden />
          </Button>
        </div>

        {found !== null && <div className="pt-2.5">{<Results items={found} />}</div>}
      </Panel>
    </>
  );
}
