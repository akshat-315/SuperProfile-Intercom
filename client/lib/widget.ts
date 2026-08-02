import { toError } from "@/lib/api";
import { type Live, type LiveEvent, keepConnected } from "@/lib/live";

export type ChatMessage = {
  id: number;
  seq: number;
  sender: "customer" | "agent";
  author: string | null;
  body: string;
  at: string;
  client_msg_id: string | null;
};

export type Thread = {
  id: number;
  status: string;
  title: string;
  preview: string;
  unread: number;
  last_at: string;
};

export type ThreadDetail = { thread: Thread; messages: ChatMessage[] };

export type Session = {
  session: string;
  browser_id: string;
  workspace_name: string;
  greeting: string | null;
  visitor: { id: number; name: string | null; email: string | null };
};

export const SESSION_GONE = "chat_session_gone";

const BROWSER_ID = "intercom.browser";

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(`${BROWSER_ID}.${key}`);
  } catch {
    return null;
  }
}

function remember(key: string, browserId: string): void {
  try {
    window.localStorage.setItem(`${BROWSER_ID}.${key}`, browserId);
  } catch {
    return;
  }
}

async function call<T>(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`/api/widget${path}`, {
    method,
    credentials: "omit",
    cache: "no-store",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function openSession(
  key: string,
  who?: { name: string; email: string },
): Promise<Session> {
  const session = await call<Session>(null, "POST", "/session", {
    key,
    browser_id: remembered(key),
    name: who?.name,
    email: who?.email,
  });
  remember(key, session.browser_id);
  return session;
}

export function listThreads(token: string): Promise<{ items: Thread[] }> {
  return call<{ items: Thread[] }>(token, "GET", "/conversations");
}

export function readThread(token: string, id: number, afterSeq = 0): Promise<ThreadDetail> {
  const from = afterSeq > 0 ? `?after_seq=${afterSeq}` : "";
  return call<ThreadDetail>(token, "GET", `/conversations/${id}${from}`);
}

export function startThread(
  token: string,
  body: string,
  clientMsgId: string,
): Promise<ThreadDetail> {
  return call<ThreadDetail>(token, "POST", "/conversations", {
    body,
    client_msg_id: clientMsgId,
  });
}

export function sendMessage(
  token: string,
  id: number,
  body: string,
  clientMsgId: string,
): Promise<ChatMessage> {
  return call<ChatMessage>(token, "POST", `/conversations/${id}/messages`, {
    body,
    client_msg_id: clientMsgId,
  });
}

export function markRead(token: string, id: number): Promise<void> {
  return call<void>(token, "POST", `/conversations/${id}/read`);
}

export function newMessageId(): string {
  return crypto.randomUUID();
}

export function mergeBySeq(held: ChatMessage[], arriving: ChatMessage[]): ChatMessage[] {
  if (arriving.length === 0) return held;
  const bySeq = new Map(held.map((m) => [m.seq, m]));
  for (const message of arriving) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function highestSeq(messages: ChatMessage[]): number {
  return messages.reduce((top, m) => (m.seq > top ? m.seq : top), 0);
}

export function stillPending(pending: ChatMessage[], canonical: ChatMessage[]): ChatMessage[] {
  if (pending.length === 0) return pending;
  const landed = new Set(canonical.map((m) => m.client_msg_id).filter(Boolean));
  return pending.filter((m) => !landed.has(m.client_msg_id));
}

export function panelTicket(token: string): Promise<string> {
  return call<{ ticket: string }>(token, "POST", "/ws/ticket").then((r) => r.ticket);
}

export function connectPanel(
  getTicket: () => Promise<string>,
  onEvent: (event: LiveEvent) => void,
): Live {
  return keepConnected("/ws/widget", getTicket, onEvent);
}
