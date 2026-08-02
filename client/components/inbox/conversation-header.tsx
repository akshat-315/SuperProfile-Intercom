"use client";

import { ArrowLeft, Info, Mail, MessageSquare } from "lucide-react";
import Link from "next/link";

import { ConversationActions } from "@/components/inbox/conversation-actions";
import { DETAILS_TRIGGER_ID } from "@/components/inbox/customer-rail";
import { ConversationStatus } from "@/components/inbox/status-pill";
import { Initials } from "@/components/initials";
import type { Member } from "@/lib/auth";
import { type ConversationRow, whenLabel } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/**
 * The header absorbs the channel, the address and the assignee — all three of
 * which the right rail used to restate. Below `md` it becomes the thread's app
 * bar: a 44px back target on the left, the ⓘ that raises the details sheet on
 * the right, and the actions moved down to the strip above the composer.
 */
export function ConversationHeader({
  row,
  team,
  onChanged,
  onOpenDetails,
  detailsOpen,
}: {
  row: ConversationRow;
  team: Member[];
  onChanged: () => void;
  onOpenDetails: () => void;
  detailsOpen: boolean;
}) {
  const Channel = row.channel === "email" ? Mail : MessageSquare;
  const channelName = row.channel === "email" ? "Email" : "Live chat";
  const waiting = row.unread > 0 && row.status !== "resolved";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-2 md:h-auto md:gap-3 md:px-4 md:py-3">
      <Link
        href="/inbox"
        aria-label="Back to the inbox"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-secondary md:hidden"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>

      <Initials name={row.customer.name} className="size-[30px] shrink-0 md:size-7" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[15px] font-semibold md:text-base">{row.customer.name}</h2>
          <Channel className="hidden size-3.5 shrink-0 text-ink-400 md:block" aria-hidden />
          <div className="hidden md:block">
            <ConversationStatus row={row} />
          </div>
        </div>
        <p className="truncate text-[11.5px] text-ink-500 md:text-xs">
          <span className="md:hidden">
            {channelName}
            {waiting && ` · waiting ${whenLabel(row.last_message_at)}`}
          </span>
          <span className="hidden md:inline">
            {row.customer.email ?? "No email given"} · {channelName}
            {row.subject && ` · ${row.subject}`}
          </span>
        </p>
      </div>

      <ConversationActions
        row={row}
        team={team}
        onChanged={onChanged}
        className="hidden md:flex"
      />

      {/* The permanent rail only exists from 1120px up. Below that the same
          panels arrive as a sheet, raised from here. */}
      <button
        id={DETAILS_TRIGGER_ID}
        type="button"
        onClick={onOpenDetails}
        aria-expanded={detailsOpen}
        aria-label="Conversation details"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl transition-colors md:size-9 min-[1120px]:hidden",
          detailsOpen ? "bg-brand-50 text-brand-600" : "text-ink-700 hover:bg-secondary",
        )}
      >
        <Info className="size-5 md:size-4.5" aria-hidden />
      </button>
    </header>
  );
}
