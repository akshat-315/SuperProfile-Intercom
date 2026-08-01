import { MessagesSquare } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MessagesSquare className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium">Pick a conversation</p>
        <p className="text-sm text-muted-foreground">Choose one on the left to read it.</p>
      </div>
    </div>
  );
}
