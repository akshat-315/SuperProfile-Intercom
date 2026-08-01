import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex h-full min-h-svh flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium">Your inbox lives here</p>
        <p className="text-sm text-muted-foreground">Conversations arrive in the next slice.</p>
      </div>
    </div>
  );
}
