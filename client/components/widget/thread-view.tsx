"use client";

import { motion } from "motion/react";
import { SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MockMessage } from "@/lib/widget-mock";

export function ThreadView({
  messages,
  greeting,
  onSend,
}: {
  messages: MockMessage[];
  greeting?: string;
  onSend: (body: string) => void;
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {greeting && messages.length === 0 && (
          <p className="rounded-2xl bg-muted px-4 py-2.5 text-sm">{greeting}</p>
        )}

        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        <div ref={bottom} />
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            rows={1}
            className="max-h-28 min-h-9 resize-none py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button size="icon" onClick={send} aria-label="Send" disabled={!body.trim()}>
            <SendHorizonal className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </>
  );
}

function Bubble({ message }: { message: MockMessage }) {
  const mine = message.from === "customer";
  const at = new Date(message.at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
          mine ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.body}
      </div>
      <span className="px-1 text-[11px] text-muted-foreground">
        {mine ? "You" : message.author} ·{" "}
        {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
    </motion.div>
  );
}
