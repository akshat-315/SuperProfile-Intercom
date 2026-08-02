"use client";

import { Mail, MessageSquare } from "lucide-react";
import Link from "next/link";

import { Initials } from "@/components/initials";
import { ConversationStatus } from "@/components/inbox/status-pill";
import { cn } from "@/lib/utils";
import { type ConversationRow, whenLabel } from "@/lib/inbox";

/**
 * 64–92px, variable. A row with nothing to say is two lines; a row carrying a
 * status or an assignee grows a third. That variability is the point — rows
 * that need something are physically larger.
 *
 * Unread is carried by three signals, none of them colour alone: the name goes
 * to weight 600, a 6px violet dot takes the left gutter so the eye can run down
 * the edge of the list without reading anything, and the count sits as a violet
 * numeral on the meta row. No pulse — an inbox that throbs is an inbox you
 * learn to stop seeing. Selection is the row with a background, so selection
 * and unread never compete for the same treatment.
 */
export function ThreadRow({ row, active }: { row: ConversationRow; active: boolean }) {
  const Channel = row.channel === "email" ? Mail : MessageSquare;
  const channelName = row.channel === "email" ? "Email" : "Live chat";
  const unread = row.unread > 0;
  const hasMeta =
    Boolean(row.assignee) || unread || row.status === "resolved" || Boolean(row.snoozed_until);

  return (
    <Link
      href={`/inbox/${row.id}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex min-h-16 gap-0 border-b py-2.5 pr-3.5 transition-colors duration-[120ms] ease-harbour",
        active ? "bg-brand-50 shadow-[inset_2px_0_0_var(--brand-500)]" : "hover:bg-[#FAF9FC]",
      )}
    >
      <span className="flex w-3 shrink-0 justify-center pt-3">
        {unread && <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />}
      </span>

      <span className="relative mr-2.5 shrink-0">
        <Initials name={row.customer.name} />
        <span
          title={channelName}
          className={cn(
            "absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full border text-ink-500",
            active ? "border-brand-100 bg-brand-50" : "border-line bg-surface",
          )}
        >
          <Channel className="size-2.5" aria-hidden />
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              unread ? "font-semibold text-ink-900" : "font-medium text-ink-700",
            )}
          >
            {row.customer.name}
          </span>
          <span className="sr-only">{channelName}.</span>
          <time dateTime={row.last_message_at} className="shrink-0 text-xs text-ink-500">
            {whenLabel(row.last_message_at)}
          </time>
        </span>

        {row.subject && (
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              unread ? "text-ink-900" : "text-ink-700",
            )}
          >
            {row.subject}
          </span>
        )}

        <span
          className={cn(
            "truncate leading-snug",
            row.subject
              ? "text-xs text-ink-500"
              : cn("text-[13px]", unread ? "text-ink-700" : "text-ink-500"),
          )}
        >
          {row.preview}
        </span>

        {hasMeta && (
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <ConversationStatus row={row} />
            {row.assignee && (
              <span className="min-w-0 truncate text-[11.5px] text-ink-500">
                {row.assignee.name}
              </span>
            )}
            {unread && (
              <span
                data-numeric
                aria-label={`${row.unread} unread`}
                className="ml-auto grid h-[17px] min-w-[17px] shrink-0 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white"
              >
                {row.unread}
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  );
}
