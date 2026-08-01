"use client";

import { AnimatePresence } from "motion/react";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { Composer } from "@/components/inbox/composer";
import { ConversationHeader } from "@/components/inbox/conversation-header";
import { CustomerRail } from "@/components/inbox/customer-rail";
import { MessageBubble } from "@/components/inbox/message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import { type Member, team as teamApi } from "@/lib/auth";
import { type ConversationDetail, type Message } from "@/lib/inbox";
import { inbox } from "@/lib/inbox";

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const conversationId = Number(id);

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [pending, setPending] = useState<Message[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [gone, setGone] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await inbox.thread(conversationId, signal);
        setDetail(next);
        setPending([]);
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
    bottom.current?.scrollIntoView({ behavior: detail === null ? "auto" : "smooth" });
  }, [detail, pending]);

  if (gone) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium">You cannot open this conversation</p>
        <p className="text-sm text-muted-foreground">
          It may belong to a colleague, or it may no longer exist.
        </p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-1/2" />
      </div>
    );
  }

  const messages = [...detail.messages, ...pending];

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader row={detail.conversation} team={team} onChanged={() => load()} />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <MessageBubble
                key={message.client_msg_id ?? message.id}
                message={message}
                pending={pending.some((p) => p.client_msg_id === message.client_msg_id)}
              />
            ))}
          </AnimatePresence>
          <div ref={bottom} />
        </div>

        <Composer
          conversationId={conversationId}
          onSent={(text, clientId) => {
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
            ]);
            setTimeout(() => load(), 400);
          }}
        />
      </div>

      <CustomerRail row={detail.conversation} />
    </>
  );
}
