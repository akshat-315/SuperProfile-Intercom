"use client";

import { ListFilter } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Filters, State } from "@/lib/inbox";

const ALL = "all";

const STATES: { value: State; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
];

/**
 * Three chips and a popover, in place of a full-width Tabs list plus two
 * always-open Selects. Same `Filters` object in and out; it just stops spending
 * 110px of vertical space on three states and two dropdowns that are changed
 * once a week.
 */
export function InboxFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const narrowed = Boolean(filters.assignee) || Boolean(filters.channel);

  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-2.5 md:px-3.5 md:pt-0">
      {STATES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={filters.state === value}
          onClick={() => onChange({ ...filters, state: value })}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12.5px] transition-colors duration-[120ms] ease-harbour md:h-[26px] md:px-2.5",
            filters.state === value
              ? "border-brand-500 bg-brand-500 font-semibold text-white"
              : "border-line bg-surface font-medium text-ink-700 hover:bg-rail",
          )}
        >
          {label}
        </button>
      ))}

      <Popover>
        <PopoverTrigger
          aria-label="Filter by assignee and channel"
          className={cn(
            "relative ml-auto grid size-9 shrink-0 place-items-center rounded-md border transition-colors duration-[120ms] ease-harbour md:size-[26px]",
            narrowed
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-line text-ink-500 hover:bg-secondary hover:text-ink-900",
          )}
        >
          <ListFilter className="size-4 md:size-3.5" aria-hidden />
          {narrowed && (
            <span
              className="absolute -top-1 -right-1 size-2 rounded-full bg-brand-500"
              aria-hidden
            />
          )}
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 space-y-3 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="filter-assignee" className="text-xs text-ink-500">
              Assigned to
            </Label>
            <Select
              value={filters.assignee ?? ALL}
              onValueChange={(v) => onChange({ ...filters, assignee: v === ALL ? undefined : v })}
            >
              <SelectTrigger id="filter-assignee" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                <SelectItem value="me">Mine</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-channel" className="text-xs text-ink-500">
              Channel
            </Label>
            <Select
              value={filters.channel ?? ALL}
              onValueChange={(v) =>
                onChange({ ...filters, channel: v === ALL ? undefined : (v as "chat" | "email") })
              }
            >
              <SelectTrigger id="filter-channel" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Both</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
