import { toError } from "@/lib/api";

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

export function readThread(token: string, id: number): Promise<ThreadDetail> {
  return call<ThreadDetail>(token, "GET", `/conversations/${id}`);
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
