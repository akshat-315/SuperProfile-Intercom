"use client";

import { Mail, MessageSquare, User } from "lucide-react";

import { Assistant } from "@/components/inbox/assistant";
import { Separator } from "@/components/ui/separator";
import type { ConversationRow } from "@/lib/inbox";

export function CustomerRail({ row }: { row: ConversationRow }) {
  const since = new Date(row.last_message_at);

  return (
    <aside className="hidden w-[280px] shrink-0 border-l p-4 xl:block">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <User className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.customer.email ?? "No email given"}
          </p>
        </div>
      </div>

      <Separator className="my-4" />

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Channel</dt>
          <dd className="flex items-center gap-1.5">
            {row.channel === "email" ? (
              <Mail className="size-3.5" aria-hidden />
            ) : (
              <MessageSquare className="size-3.5" aria-hidden />
            )}
            {row.channel === "email" ? "Email" : "Live chat"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last message</dt>
          <dd>{since.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Assigned to</dt>
          <dd>{row.assignee?.name ?? "Nobody yet"}</dd>
        </div>
      </dl>
          <Assistant conversationId={row.id} />
    </aside>
  );
}
