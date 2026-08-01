"use client";

import { Check, Mail, MessageSquare, RotateCcw, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import type { Member } from "@/lib/auth";
import { type ConversationRow, announceChange, inbox } from "@/lib/inbox";

export function ConversationHeader({
  row,
  team,
  onChanged,
}: {
  row: ConversationRow;
  team: Member[];
  onChanged: () => void;
}) {
  const Icon = row.channel === "email" ? Mail : MessageSquare;
  const resolved = row.status === "resolved";

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast.success(done);
      onChanged();
      announceChange();
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "That did not work.");
    }
  }

  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="truncate font-medium">{row.customer.name}</h2>
          {resolved && <Badge variant="secondary">resolved</Badge>}
          {row.snoozed_until && <Badge variant="outline">snoozed</Badge>}
        </div>
        {row.subject && <p className="truncate text-sm text-muted-foreground">{row.subject}</p>}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <UserPlus className="size-3.5" aria-hidden />
            {row.assignee ? row.assignee.name : "Assign"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {team.map((member) => (
            <DropdownMenuItem
              key={member.user_id}
              disabled={member.user_id === row.assignee?.id}
              onClick={() => run(() => inbox.assign(row.id, member.user_id), `Assigned to ${member.name}`)}
            >
              {member.name}
              <span className="ml-auto text-xs text-muted-foreground">{member.role}</span>
            </DropdownMenuItem>
          ))}
          {row.assignee && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => run(() => inbox.assign(row.id, null), "Unassigned")}>
                Unassign
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {resolved ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(() => inbox.setStatus(row.id, "open"), "Reopened")}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reopen
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => run(() => inbox.setStatus(row.id, "resolved"), "Marked resolved")}
        >
          <Check className="size-3.5" aria-hidden />
          Resolve
        </Button>
      )}
    </header>
  );
}
