"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect } from "react";

import { Assistant } from "@/components/inbox/assistant";
import { Initials } from "@/components/initials";
import { cn } from "@/lib/utils";
import type { ConversationRow } from "@/lib/inbox";

export const DETAILS_TRIGGER_ID = "conversation-details-trigger";

/**
 * The rail used to show Channel, Last message and Assigned to — all three of
 * which are already in the thread header or on the list row. It was a panel of
 * duplicates. Those moved into the header, and this became the answer surface:
 * summary first, because it is what you read before typing; suggestions second;
 * customer last and collapsed, because the product genuinely only holds a name
 * and an email and padding that out would be a lie.
 *
 * One element, three presentations. From 1120px up it is a static column. Below
 * that it is a sheet — a right drawer on a tablet, a bottom sheet on a phone —
 * raised by the ⓘ in the header. It is deliberately *not* a fourth route: the
 * rail is reference material consulted while composing, and a route would
 * unmount the composer, lose an unsent draft, and make "back" ambiguous.
 *
 * It is also never unmounted, at any width. The summary request fires when the
 * conversation opens and at no other time, exactly as it always has.
 */
export function CustomerRail({
  row,
  open,
  onClose,
}: {
  row: ConversationRow;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  function dismiss() {
    onClose();
    document.getElementById(DETAILS_TRIGGER_ID)?.focus();
  }

  return (
    <>
      <div
        data-open={open}
        onClick={dismiss}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 bg-[rgb(23_20_31/0.32)] opacity-0 transition-opacity duration-[160ms] ease-harbour data-[open=true]:pointer-events-auto data-[open=true]:opacity-100 min-[1120px]:hidden"
      />

      <aside
        data-open={open}
        aria-label="Conversation details"
        className={cn(
          "flex flex-col bg-rail",
          // Phone: a bottom sheet, so the thumb knows where to send it back.
          "invisible fixed inset-x-0 bottom-0 z-50 max-h-[78vh] translate-y-full rounded-t-2xl shadow-e3 transition-[transform,visibility] duration-[220ms] ease-harbour",
          "data-[open=true]:visible data-[open=true]:translate-y-0",
          // Tablet: the same panels as a 360px right drawer.
          "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-90 md:translate-x-full md:translate-y-0 md:rounded-none md:border-l",
          "md:data-[open=true]:translate-x-0",
          // 1120 and up: a permanent column. Moving the third pane down from
          // 1280 is what buys the thread enough width to be worth reading.
          "min-[1120px]:visible! min-[1120px]:static min-[1120px]:z-auto min-[1120px]:h-full min-[1120px]:w-75 min-[1120px]:translate-x-0! min-[1120px]:shadow-none min-[1120px]:transition-none xl:w-80",
        )}
      >
        <div className="shrink-0 min-[1120px]:hidden">
          <div
            aria-hidden
            className="mx-auto mt-2.5 mb-1 h-1 w-9 rounded-full bg-line-input/50 md:hidden"
          />
          <div className="flex items-center gap-2 border-b px-2 py-1.5 pl-4">
            <h2 className="flex-1 text-[15px] font-semibold">Details</h2>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close details"
              className="grid size-11 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-secondary"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Assistant conversationId={row.id} />

          <details className="group min-w-0 rounded-xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[11px] font-semibold tracking-[0.06em] text-ink-500 uppercase">
              Customer
              <ChevronDown
                className="ml-auto size-3.5 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="flex items-center gap-3 border-t px-3.5 py-3">
              <Initials name={row.customer.name} className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">{row.customer.name}</p>
                <p className="truncate text-xs text-ink-500">
                  {row.customer.email ?? "No email given"}
                </p>
              </div>
            </div>
          </details>
        </div>
      </aside>
    </>
  );
}
