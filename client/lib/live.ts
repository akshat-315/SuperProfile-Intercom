export type LiveEvent =
  | { t: "resync" }
  | { t: "message"; conversation: number; seq: number };

const FIRST_DELAY = 1000;
const MAX_DELAY = 30000;
const JITTER = 0.25;

function socketUrl(path: string, ticket: string): string {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN || window.location.origin;
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

function withJitter(delay: number): number {
  return delay * (1 - JITTER + Math.random() * JITTER * 2);
}

export function keepConnected(
  path: string,
  getTicket: () => Promise<string>,
  onEvent: (event: LiveEvent) => void,
  onFocus?: () => void,
): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let delay = FIRST_DELAY;
  let stopped = false;

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
      ticket = await getTicket();
    } catch {
      later();
      return;
    }
    if (stopped) return;

    const live = new WebSocket(socketUrl(path, ticket));
    socket = live;

    live.onopen = () => {
      delay = FIRST_DELAY;
    };
    live.onmessage = (frame) => {
      try {
        onEvent(JSON.parse(frame.data) as LiveEvent);
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

  function focused() {
    onFocus?.();
    if (socket !== null) return;
    delay = FIRST_DELAY;
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    void open();
  }

  window.addEventListener("focus", focused);
  void open();

  return () => {
    stopped = true;
    window.removeEventListener("focus", focused);
    if (retry !== null) clearTimeout(retry);
    socket?.close();
    socket = null;
  };
}
