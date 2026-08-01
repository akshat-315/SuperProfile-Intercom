"use client";

import { AnimatePresence, motion } from "motion/react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { InboxFilters } from "@/components/inbox/filters";
import { ThreadRow } from "@/components/inbox/thread-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHANGED, type ConversationRow, type Filters, inbox } from "@/lib/inbox";

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

  return (
    <div className="flex h-svh w-[360px] shrink-0 flex-col border-r">
      <InboxFilters filters={filters} onChange={setFilters} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        )}

        {rows?.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">Nothing here.</p>
            {filters.state === "active" && (
              <Button variant="outline" size="sm" onClick={seed}>
                Add sample conversations
              </Button>
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
              transition={{ duration: 0.15 }}
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
              className="w-full"
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
