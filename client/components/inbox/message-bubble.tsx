"use client";

import { motion, useReducedMotion } from "motion/react";

import { Initials } from "@/components/initials";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/inbox";

/**
 * Agent replies are a violet tint, not a saturated fill. They are 50–70% of a
 * long thread, and a fill across that much surface is exhausting by hour three
 * — which is exactly what the old near-black `bg-primary` bubble did. The tint
 * carries the same mine-vs-theirs signal at a fraction of the weight and hands
 * the contrast back to the customer's words, which are the ones that need
 * reading.
 *
 * `startsRun` / `endsRun` are computed by the parent, which is the only place
 * that can see the neighbouring message. The author appears once per run and
 * the time once at the end of it, instead of stamping the same two facts under
 * every single bubble.
 */
export function MessageBubble({
  message,
  authorName,
  pending,
  startsRun,
  endsRun,
}: {
  message: Message;
  authorName: string;
  pending?: boolean;
  startsRun: boolean;
  endsRun: boolean;
}) {
  const outbound = message.direction === "outbound";
  const at = new Date(message.created_at);
  const still = useReducedMotion();

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: pending ? 0.55 : 1, y: 0 }}
      transition={{ duration: still ? 0.12 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "flex max-w-[86%] gap-2.5 md:max-w-[78%]",
        outbound ? "ml-auto flex-row-reverse" : "mr-auto",
        startsRun && "mt-3 first:mt-0",
      )}
    >
      {!outbound && (
        <span className="w-6.5 shrink-0">
          {startsRun && <Initials name={authorName} className="size-6.5 text-[10px]" />}
        </span>
      )}

      <div className={cn("flex min-w-0 flex-col gap-1", outbound && "items-end")}>
        {startsRun && (
          <span className="px-0.5 text-[11.5px] font-semibold text-ink-500">
            {outbound ? (message.author?.name ?? "You") : authorName}
          </span>
        )}

        <div
          className={cn(
            "min-w-0 rounded-[14px] px-3.5 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
            outbound
              ? "border border-brand-100 bg-brand-50 text-brand-900"
              : "border border-line bg-surface text-ink-900 shadow-e1",
            /* Each run squares its tail corner. It is one line, and it is the
               whole reason the thread reads as a conversation. */
            endsRun && (outbound ? "rounded-br-[4px]" : "rounded-bl-[4px]"),
          )}
        >
          {message.body_text}
        </div>

        {endsRun && (
          <time
            dateTime={message.created_at}
            className="px-0.5 text-[11.5px] text-ink-500"
          >
            {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {outbound && (pending ? " · Sending…" : " · Sent")}
          </time>
        )}
      </div>
    </motion.div>
  );
}
