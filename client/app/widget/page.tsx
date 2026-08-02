"use client";

import { ArrowLeft, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { IdentityForm } from "@/components/widget/identity-form";
import { ThreadSummary } from "@/components/widget/thread-summary";
import { ThreadView } from "@/components/widget/thread-view";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { type Live, typingSignal } from "@/lib/live";
import {
  type ChatMessage,
  SESSION_GONE,
  type Session,
  type Thread,
  connectPanel,
  highestSeq,
  listThreads,
  markRead,
  mergeBySeq,
  newMessageId,
  openSession,
  panelTicket,
  readThread,
  sendMessage,
  startThread,
  stillPending,
} from "@/lib/widget";

type View =
  | { at: "loading" }
  | { at: "broken"; why: string }
  | { at: "identity" }
  | { at: "list" }
  | { at: "thread"; id: number }
  | { at: "new" };

const NO_KEY = "This chat is not set up yet.";

function Panel() {
  const key = useSearchParams().get("key");
  const session = useRef<Session | null>(null);

  const [view, setView] = useState<View>({ at: "loading" });
  const [greeting, setGreeting] = useState<string | null>(null);
  const [title, setTitle] = useState("Chat");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [seen, setSeen] = useState(false);
  const viewRef = useRef<View>({ at: "loading" });
  const liveRef = useRef<Live | null>(null);
  const seqRef = useRef(0);
  viewRef.current = view;
  seqRef.current = highestSeq(messages);

  const identify = useCallback(
    async (who?: { name: string; email: string }) => {
      if (!key) throw new ApiError({ code: "no_key", message: NO_KEY, status: 400, traceId: "" });
      const opened = await openSession(key, who);
      session.current = opened;
      setGreeting(opened.greeting);
      setTitle(opened.workspace_name);
      return opened;
    },
    [key],
  );

  const withSession = useCallback(
    async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
      const current = session.current ?? (await identify());
      try {
        return await run(current.session);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== SESSION_GONE) throw error;
        const renewed = await identify();
        return run(renewed.session);
      }
    },
    [identify],
  );

  const refreshList = useCallback(async () => {
    const { items } = await withSession(listThreads);
    setThreads(items);
    return items;
  }, [withSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const opened = await identify();
        const items = await refreshList();
        if (cancelled) return;
        if (items.length > 0) setView({ at: "list" });
        else if (opened.visitor.email) setView({ at: "new" });
        else setView({ at: "identity" });
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        const why = error instanceof ApiError ? error.message : NO_KEY;
        setView({ at: "broken", why });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identify, refreshList]);

  useEffect(() => {
    const unread = threads.reduce((total, thread) => total + thread.unread, 0);
    window.parent.postMessage({ type: "unread", count: unread }, "*");
  }, [threads]);

  const typingRef = useRef<ReturnType<typeof typingSignal> | null>(null);

  useEffect(() => {
    if (view.at !== "thread" || liveRef.current === null) {
      typingRef.current?.done();
      typingRef.current = null;
      return;
    }
    typingRef.current = typingSignal(liveRef.current, view.id);
    setAgentTyping(false);
    setSeen(false);
    return () => {
      typingRef.current?.done();
      typingRef.current = null;
    };
  }, [view]);

  const reload = useCallback(
    async (id: number, afterSeq = 0) => {
      const detail = await withSession((token) => readThread(token, id, afterSeq));
      setMessages((held) => {
        const merged = mergeBySeq(held, detail.messages);
        setPending((waiting) => stillPending(waiting, merged));
        return merged;
      });
      setTitle(detail.thread.title);
      if (detail.thread.unread > 0) await withSession((token) => markRead(token, id));
      await refreshList();
    },
    [withSession, refreshList],
  );

  useEffect(() => {
    if (!ready) return;
    const live = connectPanel(
      () => withSession(panelTicket),
      (event) => {
        if (event.t === "error") return;
        if (event.t === "resync") {
          void refreshList();
          return;
        }

        const current = viewRef.current;
        const mine = current.at === "thread" && current.id === event.conversation;

        if (event.t === "typing") {
          if (mine) setAgentTyping(event.who === "agent" && event.on);
          return;
        }
        if (event.t === "read") {
          if (mine) setSeen(event.who === "agent");
          return;
        }
        if (mine) {
          if (event.seq > seqRef.current) void reload(current.id, seqRef.current);
          return;
        }
        void refreshList();
      },
    );
    liveRef.current = live;
    return () => {
      liveRef.current = null;
      live.stop();
    };
  }, [ready, withSession, refreshList, reload]);

  async function open(id: number) {
    setView({ at: "thread", id });
    setMessages([]);
    setPending([]);
    await reload(id);
  }

  function toList() {
    setView({ at: "list" });
    setTitle(session.current?.workspace_name ?? "Chat");
    void refreshList();
  }

  async function send(body: string) {
    if (sending) return;
    setSending(true);

    const clientMsgId = newMessageId();
    const optimistic: ChatMessage = {
      id: -Date.now(),
      seq: 0,
      sender: "customer",
      author: null,
      body,
      at: new Date().toISOString(),
      client_msg_id: clientMsgId,
    };
    setPending((waiting) => [...waiting, optimistic]);

    try {
      if (view.at === "new") {
        const detail = await withSession((token) => startThread(token, body, clientMsgId));
        setMessages(mergeBySeq([], detail.messages));
        setPending((waiting) => stillPending(waiting, detail.messages));
        setTitle(detail.thread.title);
        setView({ at: "thread", id: detail.thread.id });
      } else if (view.at === "thread") {
        const saved = await withSession((token) =>
          sendMessage(token, view.id, body, clientMsgId),
        );
        setMessages((held) => {
          const merged = mergeBySeq(held, [saved]);
          setPending((waiting) => stillPending(waiting, merged));
          return merged;
        });
      }
      await refreshList();
    } catch (error) {
      setPending((waiting) => waiting.filter((m) => m.client_msg_id !== clientMsgId));
      const why = error instanceof ApiError ? error.message : NO_KEY;
      setView({ at: "broken", why });
    } finally {
      setSending(false);
    }
  }

  const canGoBack = threads.length > 0 && (view.at === "thread" || view.at === "new");

  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-3">
        {canGoBack ? (
          <Button variant="ghost" size="icon" onClick={toList} aria-label="Back">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        ) : (
          <div className="w-2" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {view.at === "thread" ? "We usually reply in a few minutes" : "Ask us anything"}
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

      {view.at === "loading" && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )}

      {view.at === "broken" && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-muted-foreground">{view.why}</p>
        </div>
      )}

      {view.at === "identity" && (
        <IdentityForm
          greeting={greeting ?? "Tell us who you are and we'll pick this up anywhere."}
          onDone={async (who) => {
            try {
              await identify(who);
              await refreshList();
              setView({ at: "new" });
            } catch (error) {
              const why = error instanceof ApiError ? error.message : NO_KEY;
              setView({ at: "broken", why });
            }
          }}
        />
      )}

      {view.at === "list" && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.map((thread) => (
              <ThreadSummary key={thread.id} thread={thread} onOpen={() => void open(thread.id)} />
            ))}
          </div>
          <div className="border-t p-3">
            <Button
              className="w-full"
              onClick={() => {
                setMessages([]);
                setView({ at: "new" });
              }}
            >
              <Plus className="size-4" aria-hidden />
              Ask about something else
            </Button>
          </div>
        </>
      )}

      {view.at === "new" && <ThreadView messages={[]} greeting={greeting} onSend={send} />}

      {view.at === "thread" && (
        <ThreadView
          messages={[...messages, ...pending]}
          pending={pending}
          onSend={send}
          typing={agentTyping}
          seen={seen}
          onTyping={() => typingRef.current?.keystroke()}
        />
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
