"use client";

import { AnimatePresence, motion } from "motion/react";
import { Inbox as InboxIcon, ListFilter } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { InboxFilters } from "@/components/inbox/filters";
import { ThreadRow } from "@/components/inbox/thread-row";
import { Button } from "@/components/ui/button";
import { CHANGED, type ConversationRow, type Filters, inbox } from "@/lib/inbox";

const EMPTY_STATE_TITLE: Record<Filters["state"], string> = {
  active: "Nothing has come in yet",
  snoozed: "Nothing in Snoozed",
  resolved: "Nothing resolved yet",
};

const EMPTY_STATE_BODY: Record<Filters["state"], string> = {
  active: "Once the widget is on your site, every message lands here. Nobody is waiting on you.",
  snoozed: "No conversations are parked for later right now.",
  resolved: "Conversations you close will collect here.",
};

/**
 * The skeleton matches the real row geometry — avatar circle, a short name bar,
 * a preview line, and a third line on some rows. Today's two bare bars are why
 * the list visibly jumps when data lands. Refetches never shimmer: the stale
 * rows stay and swap in place.
 */
function RowSkeleton({ lines }: { lines: number }) {
  const widths = ["44%", "88%", "56%"];
  return (
    <div className="flex min-h-16 gap-2.5 border-b py-2.5 pr-3.5 pl-3">
      <div className="size-8 shrink-0 rounded-full bg-[#EFEDF4]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        {widths.slice(0, lines).map((width) => (
          <div key={width} className="skeleton-sweep h-2.5 rounded-full" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

export function ThreadList() {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id ? Number(params.id) : null;

  const [filters, setFilters] = useState<Filters>({ state: "active" });
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    inbox
      .list(filters, undefined, controller.signal)
      .then((page) => {
        setRows(page.items);
        setCursor(page.next_cursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    const refresh = () => {
      inbox
        .list(filters)
        .then((page) => {
          setRows(page.items);
          setCursor(page.next_cursor);
        })
        .catch(() => undefined);
    };
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (cursor === null) return;
    setLoadingMore(true);
    try {
      const page = await inbox.list(filters, cursor);
      setRows((current) => [...(current ?? []), ...page.items]);
      setCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filters]);

  async function seed() {
    await inbox.seed();
    toast.success("Sample conversations added");
    setFilters({ ...filters });
  }

  const narrowed = Boolean(filters.assignee) || Boolean(filters.channel);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-surface md:w-80 md:shrink-0 md:border-r xl:w-[340px]">
      {/* On a phone the app bar above already says "Inbox"; this would be the
          same word twice. */}
      <header className="hidden items-center gap-2.5 px-3 pt-3.5 pb-2.5 md:flex md:px-3.5">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold">
          Inbox
          {rows !== null && cursor === null && rows.length > 0 && (
            <span
              data-numeric
              className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-ink-500"
            >
              {rows.length}
            </span>
          )}
        </h2>
      </header>

      <InboxFilters filters={filters} onChange={setFilters} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rows === null && (
          <div aria-hidden>
            <RowSkeleton lines={2} />
            <RowSkeleton lines={3} />
            <RowSkeleton lines={2} />
            <RowSkeleton lines={2} />
            <RowSkeleton lines={3} />
          </div>
        )}

        {rows?.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
            {narrowed ? (
              <ListFilter className="size-11 text-brand-200" strokeWidth={1.5} aria-hidden />
            ) : (
              <InboxIcon className="size-11 text-brand-200" strokeWidth={1.5} aria-hidden />
            )}
            <p className="text-sm font-semibold">
              {narrowed ? "Nothing matches these filters" : EMPTY_STATE_TITLE[filters.state]}
            </p>
            <p className="max-w-[34ch] text-[12.5px] leading-relaxed text-ink-500">
              {narrowed
                ? "Try widening the assignee or the channel."
                : EMPTY_STATE_BODY[filters.state]}
            </p>
            {narrowed ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => setFilters({ state: filters.state })}
              >
                Clear filters
              </Button>
            ) : (
              filters.state === "active" && (
                <Button variant="outline" size="sm" className="mt-1" onClick={seed}>
                  Add sample conversations
                </Button>
              )
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {rows?.map((row) => (
            <motion.div
              key={row.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ThreadRow row={row} active={row.id === activeId} />
            </motion.div>
          ))}
        </AnimatePresence>

        {cursor !== null && (
          <div className="p-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-ink-500"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
