"use client";

import { ArrowLeft, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { IdentityForm } from "@/components/widget/identity-form";
import { ThreadSummary } from "@/components/widget/thread-summary";
import { ThreadView } from "@/components/widget/thread-view";
import { Button } from "@/components/ui/button";
import { MOCK_GREETING, MOCK_THREADS, type MockMessage, type MockThread } from "@/lib/widget-mock";

type View = { at: "identity" } | { at: "list" } | { at: "thread"; id: number } | { at: "new" };

function startingView(state: string | null): View {
  if (state === "identity") return { at: "identity" };
  if (state === "new") return { at: "new" };
  if (state === "thread") return { at: "thread", id: 1 };
  return { at: "list" };
}

function Panel() {
  const params = useSearchParams();
  const [threads, setThreads] = useState<MockThread[]>(
    params.get("state") === "identity" || params.get("state") === "new" ? [] : MOCK_THREADS,
  );
  const [view, setView] = useState<View>(startingView(params.get("state")));

  useEffect(() => {
    const unread = threads.reduce((total, t) => total + t.unread, 0);
    window.parent.postMessage({ type: "unread", count: unread }, "*");
  }, [threads]);

  const open = view.at === "thread" ? threads.find((t) => t.id === view.id) : undefined;
  const canGoBack = threads.length > 0 && view.at !== "list";

  function send(body: string) {
    const message: MockMessage = {
      id: Date.now(),
      seq: 0,
      from: "customer",
      author: null,
      body,
      at: new Date().toISOString(),
    };

    if (view.at === "new" || open === undefined) {
      const created: MockThread = {
        id: Date.now(),
        subject: body.slice(0, 60),
        status: "open",
        unread: 0,
        last_at: message.at,
        messages: [message],
      };
      setThreads((current) => [created, ...current]);
      setView({ at: "thread", id: created.id });
      return;
    }

    setThreads((current) =>
      current.map((t) =>
        t.id === open.id
          ? { ...t, messages: [...t.messages, message], last_at: message.at, status: "open" }
          : t,
      ),
    );
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-3">
        {canGoBack ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView({ at: "list" })}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        ) : (
          <div className="w-2" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {open ? open.subject : "Touchline"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {open ? "We usually reply in a few minutes" : "Ask us anything"}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.parent.postMessage({ type: "close" }, "*")}
          aria-label="Close chat"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      {view.at === "identity" && (
        <IdentityForm greeting={MOCK_GREETING} onDone={() => setView({ at: "new" })} />
      )}

      {view.at === "list" && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.map((thread) => (
              <ThreadSummary
                key={thread.id}
                thread={thread}
                onOpen={() => setView({ at: "thread", id: thread.id })}
              />
            ))}
          </div>
          <div className="border-t p-3">
            <Button className="w-full" onClick={() => setView({ at: "new" })}>
              <Plus className="size-4" aria-hidden />
              Ask about something else
            </Button>
          </div>
        </>
      )}

      {view.at === "new" && (
        <ThreadView messages={[]} greeting={MOCK_GREETING} onSend={send} />
      )}

      {view.at === "thread" && open && (
        <ThreadView messages={open.messages} onSend={send} />
      )}
    </>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
