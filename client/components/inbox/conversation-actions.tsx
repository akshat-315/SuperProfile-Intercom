"use client";

import { Check, ChevronDown, RotateCcw, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Initials } from "@/components/initials";
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
import { cn } from "@/lib/utils";

/**
 * Assign and Resolve, in two shapes.
 *
 * On a phone they sit in a persistent strip directly above the composer rather
 * than in the top bar, because on a 390×844 screen the top bar is the one place
 * a thumb cannot reach and Resolve is the most-pressed control in the product.
 * There, Resolve is the only filled button on the screen — it is the decision
 * the screen exists to make. They are exported separately so the strip can put
 * the composer's own Snooze between them.
 */
type Shape = { row: ConversationRow; onChanged: () => void; strip?: boolean };

async function run(action: () => Promise<unknown>, done: string, onChanged: () => void) {
  try {
    await action();
    toast.success(done);
    onChanged();
    announceChange();
  } catch (problem) {
    toast.error(problem instanceof ApiError ? problem.message : "That did not work.");
  }
}

export function AssignControl({
  row,
  team,
  onChanged,
  strip = false,
}: Shape & { team: Member[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={strip ? "outline" : "ghost"}
          size="sm"
          className={cn("min-w-0", strip && "h-10 flex-1 text-[13px]")}
        >
          {row.assignee ? (
            <Initials name={row.assignee.name} className="size-4.5 shrink-0 text-[8px]" />
          ) : (
            <UserPlus className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">
            {row.assignee ? row.assignee.name.split(" ")[0] : "Assign"}
          </span>
          <ChevronDown className="size-3 shrink-0 text-ink-400" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={strip ? "start" : "end"} className="w-56">
        {team.map((member) => (
          <DropdownMenuItem
            key={member.user_id}
            disabled={member.user_id === row.assignee?.id}
            onClick={() =>
              run(() => inbox.assign(row.id, member.user_id), `Assigned to ${member.name}`, onChanged)
            }
          >
            {member.name}
            <span className="ml-auto text-xs text-ink-500">{member.role}</span>
          </DropdownMenuItem>
        ))}
        {row.assignee && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => run(() => inbox.assign(row.id, null), "Unassigned", onChanged)}
            >
              Unassign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ResolveControl({ row, onChanged, strip = false }: Shape) {
  if (row.status === "resolved") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(strip && "h-10 flex-1 text-[13px]")}
        onClick={() => run(() => inbox.setStatus(row.id, "open"), "Reopened", onChanged)}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Reopen
      </Button>
    );
  }
  return (
    <Button
      variant={strip ? "default" : "outline"}
      size="sm"
      className={cn(strip && "h-10 flex-1 text-[13px]")}
      onClick={() => run(() => inbox.setStatus(row.id, "resolved"), "Marked resolved", onChanged)}
    >
      <Check className="size-3.5" aria-hidden />
      Resolve
    </Button>
  );
}

export function ConversationActions({
  row,
  team,
  onChanged,
  className,
}: {
  row: ConversationRow;
  team: Member[];
  onChanged: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <AssignControl row={row} team={team} onChanged={onChanged} />
      <ResolveControl row={row} onChanged={onChanged} />
    </div>
  );
}
