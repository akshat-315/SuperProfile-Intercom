"use client";

import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { whenLabel } from "@/lib/inbox";
import type { MockThread } from "@/lib/widget-mock";

export function ThreadSummary({ thread, onOpen }: { thread: MockThread; onOpen: () => void }) {
  const last = thread.messages[thread.messages.length - 1];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{thread.subject}</span>
          {thread.unread > 0 && (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {last.from === "agent" ? `${last.author}: ` : "You: "}
          {last.body}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {thread.status === "resolved" && (
          <Badge variant="secondary" className="text-[10px]">
            resolved
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">{whenLabel(thread.last_at)}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </div>
    </button>
  );
}
