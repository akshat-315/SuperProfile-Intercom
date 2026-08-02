import { api } from "@/lib/api";
import { announceChange } from "@/lib/inbox";
import { type Live, type LiveEvent, keepConnected } from "@/lib/live";

export const ARRIVED = "inbox:arrived";
export const PRESENCE = "inbox:presence";

const COALESCE = 1000;

let current: Live | null = null;

export function inboxSend(frame: object): void {
  current?.send(frame);
}

export function connectInbox(): () => void {
  let listRefresh: ReturnType<typeof setTimeout> | null = null;

  function refreshListSoon() {
    if (listRefresh !== null) return;
    listRefresh = setTimeout(() => {
      listRefresh = null;
      announceChange();
    }, COALESCE);
  }

  function handle(event: LiveEvent) {
    if (event.t === "resync") {
      announceChange();
      return;
    }
    if (event.t === "typing" || event.t === "read" || event.t === "summary") {
      window.dispatchEvent(new CustomEvent(PRESENCE, { detail: event }));
      return;
    }
    if (event.t === "error") return;

    window.dispatchEvent(new CustomEvent(ARRIVED, { detail: event }));
    refreshListSoon();
  }

  const live = keepConnected(
    "/ws/agent",
    () => api.post<{ ticket: string }>("/ws/ticket", {}).then((r) => r.ticket),
    handle,
    announceChange,
  );
  current = live;

  return () => {
    live.stop();
    if (current === live) current = null;
    if (listRefresh !== null) clearTimeout(listRefresh);
  };
}
