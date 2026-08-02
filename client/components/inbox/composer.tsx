"use client";

import { Clock, CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { SNOOZE_CHOICES, announceChange, inbox, snoozeUntil } from "@/lib/inbox";
import { INSERT } from "@/lib/articles";
import { typingSignal } from "@/lib/live";
import { inboxSend } from "@/lib/socket";

export function Composer({
  conversationId,
  onSent,
  onSaved,
  onFailed,
}: {
  conversationId: number;
  onSent: (optimistic: string, clientId: string) => void;
  onSaved: () => void;
  onFailed: (clientId: string) => void;
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

  return (
    <div className="border-t p-3">
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          typing.keystroke();
        }}
        placeholder="Write a reply…"
        rows={3}
        className="resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>
              <Clock className="size-3.5" aria-hidden />
              Snooze
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-2">
            <p className="px-2 pb-2 text-xs text-muted-foreground">
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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => send(true)}>
            Send and resolve
          </Button>
          <SubmitButton busy={busy} size="sm" onClick={() => send()}>
            Send
            <CornerDownLeft className="size-3.5" aria-hidden />
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
