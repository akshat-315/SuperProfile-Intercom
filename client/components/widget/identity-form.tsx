"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex flex-1 flex-col justify-center gap-5 p-6">
      <div className="space-y-1.5">
        <h2 className="text-lg font-medium">Before we start</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          onDone({ name: name.trim(), email: email.trim() });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="w-name">Your name</Label>
          <Input
            id="w-name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-email">Email</Label>
          <Input
            id="w-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">So we can reply if you close this.</p>
        </div>
        <SubmitButton busy={busy} type="submit" className="w-full">
          Start chatting
        </SubmitButton>
      </form>
    </div>
  );
}
