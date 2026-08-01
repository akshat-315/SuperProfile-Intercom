"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import type { Message } from "@/lib/inbox";

export function MessageBubble({ message, pending }: { message: Message; pending?: boolean }) {
  const outbound = message.direction === "outbound";
  const at = new Date(message.created_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: pending ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("flex flex-col gap-1", outbound ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[min(560px,80%)] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
          outbound ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.body_text}
      </div>
      <span className="px-1 text-[11px] text-muted-foreground">
        {outbound ? (message.author?.name ?? "You") : "Customer"} ·{" "}
        {at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
    </motion.div>
  );
}
