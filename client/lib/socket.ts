import { api } from "@/lib/api";
import { announceChange } from "@/lib/inbox";
import { type LiveEvent, keepConnected } from "@/lib/live";

export const ARRIVED = "inbox:arrived";

const COALESCE = 1000;

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
    window.dispatchEvent(new CustomEvent(ARRIVED, { detail: event }));
    refreshListSoon();
  }

  const stop = keepConnected(
    "/ws/agent",
    () => api.post<{ ticket: string }>("/ws/ticket", {}).then((r) => r.ticket),
    handle,
    announceChange,
  );

  return () => {
    stop();
    if (listRefresh !== null) clearTimeout(listRefresh);
  };
}
