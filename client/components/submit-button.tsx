"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SubmitButton({
  busy,
  children,
  ...rest
}: React.ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button disabled={busy} {...rest}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
