"use client";

import { useParams } from "next/navigation";

import { Live } from "@/components/inbox/live";
import { ThreadList } from "@/components/inbox/thread-list";

/**
 * Three panes do not fit on a phone, so they take turns.
 *
 * Below `md` the list and the thread are stacked levels: the thread pushes in
 * from the right while the list slides to -24% and dims, which is the only
 * thing telling the agent the list still exists behind it. Both panes stay
 * mounted the whole time — nothing unmounts, nothing refetches, and the socket
 * connection above them is untouched. From `md` up they are simply columns
 * again and the transforms are dropped.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const open = Boolean(params?.id);

  return (
    /* `overflow-clip` rather than `overflow-hidden`: a hidden box is still
       programmatically scrollable, and scrolling the thread to the bottom was
       dragging this whole pane up with it. */
    <div className="relative flex min-h-0 flex-1 overflow-clip">
      <Live />

      <div
        data-open={open}
        className="flex min-w-0 md:w-80 md:shrink-0 xl:w-[340px] max-md:absolute max-md:inset-0 max-md:z-10 max-md:transition-[transform,opacity] max-md:duration-[260ms] max-md:ease-harbour max-md:data-[open=true]:-translate-x-[24%] max-md:data-[open=true]:opacity-60"
      >
        <ThreadList />
      </div>

      <div
        data-open={open}
        className="flex min-w-0 bg-paper md:flex-1 max-md:absolute max-md:inset-0 max-md:z-20 max-md:translate-x-full max-md:transition-transform max-md:duration-[260ms] max-md:ease-harbour max-md:data-[open=true]:translate-x-0"
      >
        {children}
      </div>
    </div>
  );
}
