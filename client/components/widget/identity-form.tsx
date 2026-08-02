"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Two fields is the whole form — the product stores a name and an email and
 * nothing else, so asking for anything more would be a lie about what happens
 * next. 44px inputs, 44px button, 16px padding.
 */
export function IdentityForm({
  greeting,
  onDone,
}: {
  greeting: string;
  onDone: (who: { name: string; email: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-paper p-4">
      <p className="mb-5 text-[14.5px] leading-relaxed text-ink-700">{greeting}</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          onDone({ name: name.trim(), email: email.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="w-name" className="text-xs font-semibold text-ink-700">
            Your name
          </Label>
          <Input
            id="w-name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-[10px] bg-surface px-3.5 text-[14.5px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-email" className="text-xs font-semibold text-ink-700">
            Email
          </Label>
          <Input
            id="w-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-[10px] bg-surface px-3.5 text-[14.5px]"
          />
          <p className="text-xs leading-relaxed text-ink-500">
            Only so we can reply if you close this window.
          </p>
        </div>
        <SubmitButton
          busy={busy}
          type="submit"
          className="h-11 w-full rounded-[10px] text-sm font-semibold"
        >
          Start the chat
        </SubmitButton>
      </form>
    </div>
  );
}
