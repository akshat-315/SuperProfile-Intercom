import { api } from "@/lib/api";
import { announceChange } from "@/lib/inbox";

export const ARRIVED = "inbox:arrived";

type ServerEvent =
  | { t: "resync" }
  | { t: "message"; conversation: number; seq: number };

const FIRST_DELAY = 1000;
const MAX_DELAY = 30000;
const JITTER = 0.25;
const COALESCE = 1000;

function socketUrl(ticket: string): string {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN || window.location.origin;
  const url = new URL("/ws/agent", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

function withJitter(delay: number): number {
  return delay * (1 - JITTER + Math.random() * JITTER * 2);
}

export function connectInbox(): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let listRefresh: ReturnType<typeof setTimeout> | null = null;
  let delay = FIRST_DELAY;
  let stopped = false;

  function refreshListSoon() {
    if (listRefresh !== null) return;
    listRefresh = setTimeout(() => {
      listRefresh = null;
      announceChange();
    }, COALESCE);
  }

  function handle(event: ServerEvent) {
    if (event.t === "resync") {
      announceChange();
      return;
    }
    if (event.t === "message") {
      window.dispatchEvent(new CustomEvent(ARRIVED, { detail: event }));
      refreshListSoon();
    }
  }

  function later() {
    if (stopped || retry !== null) return;
    retry = setTimeout(() => {
      retry = null;
      void open();
    }, withJitter(delay));
    delay = Math.min(delay * 2, MAX_DELAY);
  }

  async function open() {
    if (stopped) return;
    let ticket: string;
    try {
      ticket = (await api.post<{ ticket: string }>("/ws/ticket", {})).ticket;
    } catch {
      later();
      return;
    }
    if (stopped) return;

    const live = new WebSocket(socketUrl(ticket));
    socket = live;

    live.onopen = () => {
      delay = FIRST_DELAY;
    };
    live.onmessage = (frame) => {
      try {
        handle(JSON.parse(frame.data) as ServerEvent);
      } catch {
        return;
      }
    };
    live.onclose = () => {
      if (socket === live) socket = null;
      later();
    };
    live.onerror = () => live.close();
  }

  function onFocus() {
    announceChange();
    if (socket === null) {
      delay = FIRST_DELAY;
      if (retry !== null) {
        clearTimeout(retry);
        retry = null;
      }
      void open();
    }
  }

  window.addEventListener("focus", onFocus);
  void open();

  return () => {
    stopped = true;
    window.removeEventListener("focus", onFocus);
    if (retry !== null) clearTimeout(retry);
    if (listRefresh !== null) clearTimeout(listRefresh);
    socket?.close();
    socket = null;
  };
}
