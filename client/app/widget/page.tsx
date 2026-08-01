"use client";

import { X } from "lucide-react";
import { Suspense, useEffect } from "react";

import { Button } from "@/components/ui/button";

function Panel() {
  useEffect(() => {
    const parent = window.parent;
    if (parent === window) return;
    parent.postMessage({ type: "ready" }, "*");
  }, []);

  function close() {
    window.parent.postMessage({ type: "close" }, "*");
  }

  return (
    <>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Touchline</p>
          <p className="text-xs text-muted-foreground">We usually reply in a few minutes</p>
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close chat">
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">The conversation arrives next.</p>
      </div>
    </>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
