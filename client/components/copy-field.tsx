"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long the tick stays up before the button goes back to offering a copy. */
const CONFIRMED_MS = 1600;

type Props = {
  label: string;
  value: string;
  hint?: React.ReactNode;
  /** Long values wrap rather than scroll, so nothing hides off the right edge. */
  wrap?: boolean;
};

export function CopyField({ label, value, hint, wrap = false }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down
      // browser). Selecting the text still works, so say nothing and let the
      // person copy it by hand rather than pretending it worked.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRMED_MS);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {copied && (
          <span aria-hidden className="text-xs font-medium text-brand-600">
            Copied
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <code
          className={cn(
            "min-w-0 flex-1 rounded-md border bg-paper px-3 py-2 font-mono text-xs leading-5",
            wrap ? "break-all" : "overflow-x-auto whitespace-nowrap",
          )}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 sm:size-10"
          onClick={copy}
          aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
        </Button>
      </div>

      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
