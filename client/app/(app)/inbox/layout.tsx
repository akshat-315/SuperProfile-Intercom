import { Live } from "@/components/inbox/live";
import { ThreadList } from "@/components/inbox/thread-list";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh">
      <Live />
      <ThreadList />
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
