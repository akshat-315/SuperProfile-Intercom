import { cn } from "@/lib/utils";

/**
 * Four muted tints, picked deterministically from the name so the same person
 * always gets the same colour. Every pair is dark ink on a pale fill, so the
 * avatar never becomes one of the loud objects on the screen.
 */
const TINTS = [
  "bg-[#EDE7FB] text-[#4A2A96]",
  "bg-[#E6EAF0] text-[#33465E]",
  "bg-[#E5EFE7] text-[#2E5738]",
  "bg-[#F5E9E2] text-[#7A4A2E]",
] as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintOf(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum = (sum + name.charCodeAt(i)) % 1024;
  return TINTS[sum % TINTS.length];
}

export function Initials({
  name,
  className,
  ...props
}: React.ComponentProps<"span"> & { name: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold tracking-normal",
        tintOf(name),
        className,
      )}
      {...props}
    >
      {initialsOf(name)}
    </span>
  );
}
