import { cn } from "@/lib/utils";

/**
 * The mark, used purely as a shape. It is stroked rather than filled, because
 * a filled bubble turns into a blob at 16px, and it never carries a wordmark:
 * the interface shows the workspace's own name, not a product name.
 */
export function BrandMark({
  className,
  tile = true,
  ...props
}: React.ComponentProps<"svg"> & { tile?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="presentation"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
      {...props}
    >
      {tile && <rect width="32" height="32" rx="9" fill="currentColor" />}
      <path
        d="M11.5 9h9A2.5 2.5 0 0 1 23 11.5v6a2.5 2.5 0 0 1-2.5 2.5H14.6l-3.6 3.05A.5.5 0 0 1 10.2 22.7V20H11.5A2.5 2.5 0 0 1 9 17.5v-6A2.5 2.5 0 0 1 11.5 9Z"
        stroke={tile ? "#fff" : "currentColor"}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12.6 16.4c1.2-1.1 2.3-1.1 3.4 0s2.2 1.1 3.4 0"
        stroke={tile ? "#fff" : "currentColor"}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
