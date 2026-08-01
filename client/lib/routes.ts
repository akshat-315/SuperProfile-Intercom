import type { Me } from "@/lib/session";
import { stageOf } from "@/lib/session";

export const ROUTES = {
  login: "/login",
  signup: "/signup",
  welcome: "/welcome",
  workspaces: "/workspaces",
  inbox: "/inbox",
  team: "/settings/team",
  workspace: "/settings/workspace",
  invite: (code: string) => `/invite/${encodeURIComponent(code)}`,
} as const;

export function whereTo(me: Me | null): string {
  switch (stageOf(me)) {
    case "signed-out":
      return ROUTES.login;
    case "unverified":
    case "no-workspace":
      return ROUTES.welcome;
    case "ready":
      return ROUTES.inbox;
  }
}
