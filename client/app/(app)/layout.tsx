"use client";

import { ChevronsUpDown, FileText, Inbox, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { Initials } from "@/components/initials";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { ROUTES, whereTo } from "@/lib/routes";
import { type Me, fetchMe, stageOf } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: ROUTES.inbox, label: "Inbox", short: "Inbox", icon: Inbox },
  { href: ROUTES.articles, label: "Help articles", short: "Articles", icon: FileText },
  { href: ROUTES.team, label: "Team", short: "Team", icon: Users },
  { href: ROUTES.settings, label: "Settings", short: "Settings", icon: Settings },
];

/** A thread is level two on a phone: it owns the whole screen, tab bar included. */
const THREAD_PATH = /^\/inbox\/[^/]+$/;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (stageOf(me) !== "ready") router.replace(whereTo(me));
  }, [loading, me, router]);

  if (loading || me === null || me.active_workspace === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-paper">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  const section = NAV.find((item) => pathname.startsWith(item.href));
  const insideThread = THREAD_PATH.test(pathname);

  const workspaceMenu = (
    <DropdownMenuContent align="start" className="w-56">
      {me.memberships.map((m) => (
        <DropdownMenuItem
          key={m.workspace.id}
          disabled={m.workspace.id === me.active_workspace?.id}
          onClick={async () => {
            await auth.switchWorkspace(m.workspace.id);
            location.assign(ROUTES.inbox);
          }}
        >
          {m.workspace.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setCreating(true)}>
        <Plus className="size-4" />
        Create workspace
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={async () => {
          await auth.logout();
          router.replace(ROUTES.login);
        }}
      >
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-paper md:flex-row">
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />

      {/* Phone: a 56px app bar. The workspace switcher and sign-out live behind
          the avatar, because there is no left rail to hold them. */}
      {!insideThread && (
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b bg-surface px-3 md:hidden">
          <BrandMark className="size-[26px] text-brand-500" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14.5px] font-semibold">
              {section?.label ?? "Workspace"}
            </span>
            <span className="truncate text-[11.5px] text-ink-500">
              {me.active_workspace.name}
            </span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Workspace and account"
              className="grid size-11 shrink-0 place-items-center rounded-xl transition-colors hover:bg-secondary"
            >
              <Initials name={me.user.name} className="size-[30px]" />
            </DropdownMenuTrigger>
            {workspaceMenu}
          </DropdownMenu>
        </header>
      )}

      {/* 768–1279: a 64px icon rail. ≥1280: the labelled 240px rail. Collapsing
          the nav in that middle band is what buys the thread enough width to be
          worth reading. */}
      <aside className="hidden shrink-0 flex-col border-r bg-rail md:flex md:w-16 xl:w-60">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label="Workspace and account"
              className="m-2.5 h-auto justify-center gap-2.5 px-2 py-2 hover:bg-brand-500/6 xl:justify-between"
            >
              <BrandMark className="size-[26px] shrink-0 text-brand-500" />
              <span className="hidden min-w-0 flex-1 flex-col text-left xl:flex">
                <span className="truncate text-[13.5px] font-semibold">
                  {me.active_workspace.name}
                </span>
                <span className="truncate text-xs font-normal text-ink-500">{me.user.name}</span>
              </span>
              <ChevronsUpDown className="hidden size-3.5 shrink-0 text-ink-400 xl:block" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          {workspaceMenu}
        </DropdownMenu>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors duration-[120ms] ease-harbour",
                  "justify-center xl:justify-start",
                  active
                    ? "bg-brand-50 font-semibold text-brand-700"
                    : "text-ink-700 hover:bg-brand-500/6",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-2.5 bottom-1.5 w-0.5 rounded-r-sm bg-brand-500"
                  />
                )}
                <Icon
                  className={cn("size-4 shrink-0", active ? "text-brand-600" : "text-ink-500")}
                  aria-hidden
                />
                <span className="hidden truncate xl:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t p-3">
          <Initials name={me.user.name} className="size-8" />
          <span className="hidden min-w-0 flex-1 flex-col xl:flex">
            <span className="truncate text-[13px] font-medium">{me.user.name}</span>
            <span className="truncate text-[11.5px] text-ink-500">{me.user.email}</span>
          </span>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>

      {/* The bottom tab bar is the phone's navigation. 60px plus the safe area,
          and every target is the full height of the bar. */}
      {!insideThread && (
        <nav className="flex shrink-0 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ href, short, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-15 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] transition-colors duration-[120ms] ease-harbour",
                  active ? "font-semibold text-brand-600" : "text-ink-500",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="truncate">{short}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
