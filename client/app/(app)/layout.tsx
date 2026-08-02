"use client";

import { ChevronsUpDown, FileText, Inbox, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

const NAV = [
  { href: ROUTES.inbox, label: "Inbox", icon: Inbox },
  { href: ROUTES.articles, label: "Help articles", icon: FileText },
  { href: ROUTES.team, label: "Team", icon: Users },
  { href: ROUTES.workspace, label: "Workspace", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/20">
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto w-full justify-between px-2 py-2">
                <span className="truncate text-left">
                  <span className="block text-sm font-medium">{me.active_workspace.name}</span>
                  <span className="block text-xs text-muted-foreground">{me.user.name}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
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
              <DropdownMenuItem
                onClick={async () => {
                  await auth.logout();
                  router.replace(ROUTES.login);
                }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-active={pathname === href}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
