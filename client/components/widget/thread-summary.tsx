"use client";

import { ChevronRight, MessageSquare } from "lucide-react";

import { StatusPill } from "@/components/inbox/status-pill";
import { whenLabel } from "@/lib/inbox";
import type { Thread } from "@/lib/widget";

export function ThreadSummary({ thread, onOpen }: { thread: Thread; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-h-16 items-center gap-3 border-b bg-surface px-4 py-3.5 text-left transition-colors duration-[120ms] ease-harbour hover:bg-brand-50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
        <MessageSquare className="size-4.5" aria-hidden />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{thread.title}</span>
          {thread.unread > 0 && (
            <span className="size-1.5 shrink-0 rounded-full bg-brand-500" aria-label="unread" />
          )}
        </span>
        <span className="truncate text-[12.5px] text-ink-500">{thread.preview}</span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {thread.status === "resolved" && <StatusPill tone="done">Resolved</StatusPill>}
        <time dateTime={thread.last_at} className="text-[11.5px] text-ink-500">
          {whenLabel(thread.last_at)}
        </time>
        <ChevronRight className="size-4 text-ink-400" aria-hidden />
      </span>
    </button>
  );
}
