"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filters, State } from "@/lib/inbox";

const ALL = "all";

export function InboxFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="space-y-2 border-b p-3">
      <Tabs
        value={filters.state}
        onValueChange={(state) => onChange({ ...filters, state: state as State })}
      >
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">
            Active
          </TabsTrigger>
          <TabsTrigger value="snoozed" className="flex-1">
            Snoozed
          </TabsTrigger>
          <TabsTrigger value="resolved" className="flex-1">
            Resolved
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2">
        <Select
          value={filters.assignee ?? ALL}
          onValueChange={(v) => onChange({ ...filters, assignee: v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value="me">Mine</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.channel ?? ALL}
          onValueChange={(v) =>
            onChange({ ...filters, channel: v === ALL ? undefined : (v as "chat" | "email") })
          }
        >
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Both</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
