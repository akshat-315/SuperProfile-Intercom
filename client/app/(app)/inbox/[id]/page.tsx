"use client";

import { AnimatePresence } from "motion/react";
import { Lock } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "@/components/inbox/composer";
import { ConversationHeader } from "@/components/inbox/conversation-header";
import { AssignControl, ResolveControl } from "@/components/inbox/conversation-actions";
import { CustomerRail } from "@/components/inbox/customer-rail";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Button } from "@/components/ui/button";
import { type Member, team as teamApi } from "@/lib/auth";
import { type ConversationDetail, type Message, announceChange, inbox } from "@/lib/inbox";
import type { LiveEvent } from "@/lib/live";
import { ARRIVED, PRESENCE } from "@/lib/socket";

/** Runs break on a change of speaker, a gap of more than five minutes, or a day. */
const RUN_GAP = 5 * 60_000;

function dayKey(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

function dayLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: at.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function sameRun(before: Message | undefined, after: Message | undefined): boolean {
  if (!before || !after) return false;
  if (before.direction !== after.direction) return false;
  if ((before.author?.id ?? null) !== (after.author?.id ?? null)) return false;
  if (dayKey(before.created_at) !== dayKey(after.created_at)) return false;
  return (
    new Date(after.created_at).getTime() - new Date(before.created_at).getTime() < RUN_GAP
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-3 text-[11.5px] font-semibold text-ink-500">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const conversationId = Number(id);

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [pending, setPending] = useState<Message[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [gone, setGone] = useState(false);
  const [typing, setTyping] = useState(false);
  const [seen, setSeen] = useState(false);
  const [details, setDetails] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await inbox.thread(conversationId, signal);
        setDetail(next);
        setPending([]);
        announceChange();
      } catch {
        if (!signal?.aborted) setGone(true);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setGone(false);
    load(controller.signal);
    teamApi
      .list()
      .then((t) => setTeam(t.members))
      .catch(() => setTeam([]));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const arrived = (event: Event) => {
      const { conversation } = (event as CustomEvent<{ conversation: number }>).detail;
      if (conversation === conversationId) void load();
    };
    window.addEventListener(ARRIVED, arrived);
    return () => window.removeEventListener(ARRIVED, arrived);
  }, [conversationId, load]);

  useEffect(() => {
    const presence = (event: Event) => {
      const signal = (event as CustomEvent<LiveEvent>).detail;
      if (signal.t === "typing" && signal.conversation === conversationId) {
        setTyping(signal.who === "customer" && signal.on);
      }
      if (signal.t === "read" && signal.conversation === conversationId) {
        setSeen(signal.who === "customer");
      }
    };
    window.addEventListener(PRESENCE, presence);
    return () => window.removeEventListener(PRESENCE, presence);
  }, [conversationId]);

  useEffect(() => {
    setTyping(false);
    setSeen(false);
    setDetails(false);
  }, [conversationId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: detail === null ? "auto" : "smooth" });
  }, [detail, pending]);

  if (gone) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 text-center">
        <Lock className="size-11 text-stop" strokeWidth={1.5} aria-hidden />
        <p className="font-semibold">You cannot open this conversation</p>
        <p className="max-w-[34ch] text-sm text-ink-500">
          It may belong to a colleague, or it may no longer exist.
        </p>
        <Button variant="outline" size="sm" className="mt-1" asChild>
          <Link href="/inbox">Back to the inbox</Link>
        </Button>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="flex min-w-0 flex-1 flex-col" aria-hidden>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface px-4 md:h-auto md:py-3">
          <div className="size-8 shrink-0 rounded-full bg-[#EFEDF4]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="skeleton-sweep h-3 w-40 rounded-full" />
            <div className="skeleton-sweep h-2.5 w-56 rounded-full" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4 md:p-6">
          <div className="skeleton-sweep h-14 w-3/5 rounded-[14px]" />
          <div className="skeleton-sweep ml-auto h-20 w-2/3 rounded-[14px]" />
          <div className="skeleton-sweep h-11 w-2/5 rounded-[14px]" />
        </div>
      </div>
    );
  }

  const messages = [...detail.messages, ...pending];
  const customerName = detail.conversation.customer.name;
  const resolved = detail.conversation.status === "resolved";

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col bg-paper">
        <ConversationHeader
          row={detail.conversation}
          team={team}
          onChanged={() => load()}
          onOpenDetails={() => setDetails((current) => !current)}
          detailsOpen={details}
        />

        <div
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-4 md:px-6 md:py-5"
          aria-live="polite"
          aria-relevant="additions"
        >
          <AnimatePresence initial={false}>
            {messages.flatMap((message, index) => {
              const key = message.client_msg_id ?? message.id;
              const previous = messages[index - 1];
              const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
              const bubble = (
                <MessageBubble
                  key={key}
                  message={message}
                  authorName={customerName}
                  pending={pending.some((p) => p.client_msg_id === message.client_msg_id)}
                  startsRun={!sameRun(previous, message)}
                  endsRun={!sameRun(message, messages[index + 1])}
                />
              );
              return newDay
                ? [
                    <DaySeparator key={`day-${key}`} label={dayLabel(message.created_at)} />,
                    bubble,
                  ]
                : [bubble];
            })}
          </AnimatePresence>

          {seen && !typing && (
            <p className="mt-1 self-end pr-0.5 text-[11.5px] text-ink-500">Seen</p>
          )}
          {typing && (
            <div className="mt-2 flex items-center gap-2.5">
              <span className="w-6.5 shrink-0" />
              <div className="flex gap-1 rounded-[14px] rounded-bl-[4px] border border-line bg-surface px-4 py-3.5 shadow-e1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-bob rounded-full bg-ink-400"
                    style={{ animationDelay: `${dot * 140}ms` }}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="sr-only">{customerName} is typing…</span>
            </div>
          )}
          <div ref={bottom} />
        </div>

        {resolved ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-surface px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <p className="text-sm text-ink-500">This conversation is resolved. Reopen it to reply.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await inbox.setStatus(conversationId, "open");
                await load();
                announceChange();
              }}
            >
              Reopen
            </Button>
          </div>
        ) : (
          <Composer
            conversationId={conversationId}
            assignAction={
              <AssignControl
                row={detail.conversation}
                team={team}
                onChanged={() => load()}
                strip
              />
            }
            resolveAction={
              <ResolveControl row={detail.conversation} onChanged={() => load()} strip />
            }
            onSent={(text, clientId) =>
              setPending((current) => [
                ...current,
                {
                  id: -Date.now(),
                  seq: 0,
                  direction: "outbound",
                  author: null,
                  body_text: text,
                  client_msg_id: clientId,
                  read_at: null,
                  created_at: new Date().toISOString(),
                },
              ])
            }
            onSaved={() => load()}
            onFailed={(clientId) =>
              setPending((current) => current.filter((m) => m.client_msg_id !== clientId))
            }
          />
        )}
      </div>

      <CustomerRail
        row={detail.conversation}
        open={details}
        onClose={() => setDetails(false)}
      />
    </>
  );
}
