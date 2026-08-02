"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Initials } from "@/components/initials";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/widget";

const RUN_GAP = 5 * 60_000;

function sameRun(before: ChatMessage | undefined, after: ChatMessage | undefined): boolean {
  if (!before || !after) return false;
  if (before.sender !== after.sender) return false;
  if ((before.author ?? null) !== (after.author ?? null)) return false;
  return new Date(after.at).getTime() - new Date(before.at).getTime() < RUN_GAP;
}

export function ThreadView({
  messages,
  greeting,
  onSend,
  pending = [],
  typing = false,
  seen = false,
  onTyping,
}: {
  messages: ChatMessage[];
  pending?: ChatMessage[];
  greeting?: string | null;
  onSend: (body: string) => void;
  typing?: boolean;
  seen?: boolean;
  onTyping?: () => void;
}) {
  const [body, setBody] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const text = body.trim();
    if (!text) return;
    onSend(text);
    setBody("");
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper">
        <div className="flex min-h-full flex-col justify-end gap-1 p-4">
          {greeting && messages.length === 0 && (
            <p className="max-w-[85%] self-start rounded-[14px] rounded-bl-[4px] border border-line bg-surface px-3.5 py-2.5 text-[14.5px] leading-relaxed shadow-e1">
              {greeting}
            </p>
          )}

          {messages.map((message, index) => (
            <Bubble
              key={message.client_msg_id ?? message.id}
              message={message}
              waiting={pending.some((p) => p.client_msg_id === message.client_msg_id)}
              startsRun={!sameRun(messages[index - 1], message)}
              endsRun={!sameRun(message, messages[index + 1])}
              seen={seen && !typing && index === messages.length - 1}
            />
          ))}

          {typing && (
            <div
              className="mt-1 flex w-fit gap-1 self-start rounded-[14px] rounded-bl-[4px] border border-line bg-surface px-4 py-3.5 shadow-e1"
              aria-label="Someone is typing"
            >
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1.5 animate-bob rounded-full bg-ink-400"
                  style={{ animationDelay: `${dot * 140}ms` }}
                  aria-hidden
                />
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className="flex shrink-0 items-end gap-2.5 border-t bg-surface px-3 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            onTyping?.();
          }}
          placeholder="Write a message…"
          aria-label="Write a message"
          className="max-h-28 min-h-10 rounded-[20px] px-4 py-2.5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          size="icon"
          onClick={send}
          aria-label="Send"
          disabled={!body.trim()}
          className="size-10 shrink-0 rounded-full"
        >
          <ArrowRight className="size-4.5" aria-hidden />
        </Button>
      </div>
    </>
  );
}

/**
 * Inverted from the agent side, deliberately. Here the customer's own messages
 * carry the saturated violet — they are a small share of the surface, it is
 * their turf, and it makes their side of the conversation feel like theirs. The
 * replies are white cards with a name and a face, because the whole job of this
 * panel is to prove a human is on the other end. Timestamps appear once per run
 * and "Seen" rides on the last outbound line rather than taking a row of its own.
 */
function Bubble({
  message,
  waiting = false,
  startsRun,
  endsRun,
  seen,
}: {
  message: ChatMessage;
  waiting?: boolean;
  startsRun: boolean;
  endsRun: boolean;
  seen: boolean;
}) {
  const mine = message.sender === "customer";
  const at = new Date(message.at);
  const still = useReducedMotion();

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: waiting ? 0.6 : 1, y: 0 }}
      transition={{ duration: still ? 0.12 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("flex flex-col", mine ? "items-end" : "items-start", startsRun && "mt-2.5")}
    >
      {!mine && startsRun && message.author && (
        <span className="mb-1 flex items-center gap-2">
          <Initials name={message.author} className="size-5.5 text-[9px]" />
          <span className="text-[11.5px] font-semibold text-ink-500">{message.author}</span>
        </span>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap",
          mine
            ? cn("bg-brand-500 text-white", endsRun && "rounded-br-[4px]")
            : cn(
                "border border-line bg-surface text-ink-900 shadow-e1",
                endsRun && "rounded-bl-[4px]",
              ),
        )}
      >
        {message.body}
      </div>

      {endsRun && (
        <time dateTime={message.at} className="px-1 pt-1 text-[11px] text-ink-500">
          {waiting
            ? "sending…"
            : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          {mine && seen && !waiting && " · Seen"}
        </time>
      )}
    </motion.div>
  );
}
