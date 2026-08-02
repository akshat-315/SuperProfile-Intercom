import { MessagesSquare } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 text-center">
      <MessagesSquare className="size-11 text-brand-200" strokeWidth={1.5} aria-hidden />
      <p className="font-semibold">Pick a conversation</p>
      <p className="max-w-[34ch] text-sm text-ink-500">Choose one on the left to read it.</p>
    </div>
  );
}
