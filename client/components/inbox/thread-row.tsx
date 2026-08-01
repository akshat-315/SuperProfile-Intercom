"use client";

import { Mail, MessageSquare } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type ConversationRow, whenLabel } from "@/lib/inbox";

export function ThreadRow({ row, active }: { row: ConversationRow; active: boolean }) {
  const Icon = row.channel === "email" ? Mail : MessageSquare;
  const unread = row.unread > 0;

  return (
    <Link
      href={`/inbox/${row.id}`}
      className={cn(
        "flex flex-col gap-1 border-b px-4 py-3 transition-colors",
        active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate text-sm", unread && "font-semibold")}>
          {row.customer.name}
        </span>
        {unread && (
          <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px]">{row.unread}</Badge>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {whenLabel(row.last_message_at)}
        </span>
      </div>

      {row.subject && (
        <p className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
          {row.subject}
        </p>
      )}

      <p className="line-clamp-2 text-xs text-muted-foreground">{row.preview}</p>

      {row.assignee && (
        <span className="text-[11px] text-muted-foreground">{row.assignee.name}</span>
      )}
    </Link>
  );
}
