import { api } from "@/lib/api";
import type { components } from "@/lib/types";

export type ConversationRow = components["schemas"]["ConversationRow"];
export type ConversationDetail = components["schemas"]["ConversationDetail"];
export type Message = components["schemas"]["MessageOut"];
export type ConversationList = components["schemas"]["ConversationList"];

export type State = "active" | "snoozed" | "resolved";
export type Channel = "chat" | "email";

export type Filters = {
  state: State;
  channel?: Channel;
  assignee?: string;
};

function query(filters: Filters, cursor?: string): string {
  const params = new URLSearchParams({ state: filters.state });
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export const inbox = {
  list: (filters: Filters, cursor?: string, signal?: AbortSignal) =>
    api.get<ConversationList>(`/conversations?${query(filters, cursor)}`, signal),
  thread: (id: number, signal?: AbortSignal) =>
    api.get<ConversationDetail>(`/conversations/${id}`, signal),
  reply: (id: number, body: { body: string; client_msg_id: string; resolve?: boolean }) =>
    api.post<Message>(`/conversations/${id}/reply`, body),
  assign: (id: number, user_id: number | null) =>
    api.patch<void>(`/conversations/${id}/assign`, { user_id }),
  setStatus: (id: number, status: "open" | "resolved") =>
    api.patch<void>(`/conversations/${id}/status`, { status }),
  snooze: (id: number, until: string, body?: string) =>
    api.patch<void>(`/conversations/${id}/snooze`, { until, body: body || null }),
  seed: () => api.post<{ conversations: number }>("/dev/seed"),
};

export function whenLabel(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))}d`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const SNOOZE_CHOICES = [
  { label: "Later today", hours: 3 },
  { label: "Tomorrow", hours: 24 },
  { label: "Next week", hours: 24 * 7 },
];

export function snoozeUntil(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export const CHANGED = "inbox:changed";

export function announceChange(): void {
  window.dispatchEvent(new Event(CHANGED));
}
