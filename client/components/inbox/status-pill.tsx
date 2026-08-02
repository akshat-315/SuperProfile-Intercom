import { Check, Clock, Moon, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { type ConversationRow, whenLabel } from "@/lib/inbox";

const TONES = {
  wait: "bg-wait-bg text-wait",
  done: "bg-done-bg text-done",
  /* Snoozed is the one status that gets no hue at all. "I have decided this is
     not now" should recede, and a colour would pull the eye back to a thing the
     agent has already dismissed. */
  snoozed: "bg-secondary text-ink-500",
  stop: "bg-stop-bg text-stop",
} as const;

const GLYPHS = { wait: Clock, done: Check, snoozed: Moon, stop: TriangleAlert } as const;

export function StatusPill({
  tone,
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone: keyof typeof TONES }) {
  const Glyph = GLYPHS[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      <Glyph className="size-3" aria-hidden />
      {children}
    </span>
  );
}

function snoozeLabel(until: string): string {
  const then = new Date(until);
  const days = Math.round((then.getTime() - Date.now()) / 86_400_000);
  if (days >= 1) {
    return then.toLocaleDateString(undefined, { weekday: "long" });
  }
  return then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Everything below is derived from fields the row already carries. Nothing is
 * fetched and nothing is invented.
 *
 * "Waiting on us" is amber rather than red on purpose: a waiting customer is
 * normal operations, not a failure, and red would cry wolf twelve times before
 * lunch. It is keyed off `unread`, which the API increments only for inbound
 * messages and zeroes when an agent reads the thread — so an amber pill always
 * means a customer has said something nobody has answered.
 */
export function ConversationStatus({ row }: { row: ConversationRow }) {
  if (row.status === "resolved") return <StatusPill tone="done">Resolved</StatusPill>;
  if (row.snoozed_until) {
    return <StatusPill tone="snoozed">{snoozeLabel(row.snoozed_until)}</StatusPill>;
  }
  if (row.unread > 0) {
    return <StatusPill tone="wait">Waiting {whenLabel(row.last_message_at)}</StatusPill>;
  }
  return null;
}
