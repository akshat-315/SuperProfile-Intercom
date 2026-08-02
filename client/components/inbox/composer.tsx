"use client";

import { ArrowRight, Clock, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { SNOOZE_CHOICES, announceChange, inbox, snoozeUntil } from "@/lib/inbox";
import { INSERT } from "@/lib/articles";
import { typingSignal } from "@/lib/live";
import { inboxSend } from "@/lib/socket";
import { cn } from "@/lib/utils";

export function Composer({
  conversationId,
  onSent,
  onSaved,
  onFailed,
  assignAction,
  resolveAction,
}: {
  conversationId: number;
  onSent: (optimistic: string, clientId: string) => void;
  onSaved: () => void;
  onFailed: (clientId: string) => void;
  /** Rendered either side of Snooze in the phone's action strip. */
  assignAction?: React.ReactNode;
  resolveAction?: React.ReactNode;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const typing = useMemo(
    () => typingSignal({ stop: () => undefined, send: inboxSend }, conversationId),
    [conversationId],
  );

  useEffect(() => typing.done, [typing]);

  useEffect(() => {
    const add = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      setBody((current) => (current ? `${current.trimEnd()}\n\n${text}` : text));
    };
    window.addEventListener(INSERT, add);
    return () => window.removeEventListener(INSERT, add);
  }, []);

  async function send(resolve = false) {
    const text = body.trim();
    if (!text) return;

    const clientId = crypto.randomUUID();
    setBusy(true);
    onSent(text, clientId);
    setBody("");

    try {
      await inbox.reply(conversationId, { body: text, client_msg_id: clientId, resolve });
      if (resolve) toast.success("Marked resolved");
      onSaved();
      announceChange();
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not send that.");
      onFailed(clientId);
      setBody(text);
    } finally {
      setBusy(false);
    }
  }

  async function sendAndSnooze(hours: number, label: string) {
    const text = body.trim();
    setBusy(true);
    try {
      await inbox.snooze(conversationId, snoozeUntil(hours), text || undefined);
      setBody("");
      toast.success(`Snoozed until ${label.toLowerCase()}`);
      onSaved();
      announceChange();
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not snooze it.");
    } finally {
      setBusy(false);
    }
  }

  function snoozeTrigger(strip: boolean) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={strip ? "outline" : "ghost"}
            size="sm"
            disabled={busy}
            className={cn(strip && "h-10 flex-1 text-[13px]")}
          >
            <Clock className="size-3.5" aria-hidden />
            Snooze
          </Button>
        </PopoverTrigger>
        <PopoverContent align={strip ? "center" : "start"} className="w-60 p-2">
          <p className="px-2 pb-2 text-xs text-ink-500">
            {body.trim()
              ? "Your reply is sent, then the thread is parked."
              : "Add a line above so the customer knows."}
          </p>
          {SNOOZE_CHOICES.map((choice) => (
            <Button
              key={choice.label}
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => sendAndSnooze(choice.hours, choice.label)}
            >
              {choice.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    );
  }

  function field(className: string) {
    return (
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          typing.keystroke();
        }}
        placeholder="Write a reply…"
        className={className}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
    );
  }

  return (
    <div className="shrink-0 border-t bg-surface">
      {/* Phone: Assign · Snooze · Resolve, always visible, in thumb range,
          never behind a menu. */}
      <div className="flex items-center gap-2 px-3 py-2 md:hidden">
        {assignAction}
        {snoozeTrigger(true)}
        {resolveAction}
      </div>

      <div className="flex items-end gap-2 border-t px-3 pt-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:hidden">
        {field("max-h-32 min-h-10 rounded-[20px] px-4 py-2.5 text-base")}
        <SubmitButton
          busy={busy}
          size="icon"
          aria-label="Send reply"
          className="size-10 shrink-0 rounded-full"
          onClick={() => send()}
        >
          {!busy && <ArrowRight className="size-4.5" aria-hidden />}
        </SubmitButton>
      </div>

      <div className="hidden px-4 pt-3 pb-3.5 md:block">
        {field("min-h-[66px] rounded-[10px] px-3 py-2.5")}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {snoozeTrigger(false)}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => send(true)}>
              Send &amp; resolve
            </Button>
            <SubmitButton busy={busy} size="sm" onClick={() => send()}>
              Send
              <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />
            </SubmitButton>
          </div>
        </div>
      </div>
    </div>
  );
}
