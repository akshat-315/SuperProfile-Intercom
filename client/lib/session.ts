import { api } from "@/lib/api";
import type { components } from "@/lib/types";

export type Me = components["schemas"]["MeResponse"];
export type Membership = components["schemas"]["MembershipOut"];
export type Workspace = components["schemas"]["WorkspaceOut"];

export type Stage = "signed-out" | "unverified" | "no-workspace" | "ready";

export function stageOf(me: Me | null): Stage {
  if (me === null) return "signed-out";
  if (!me.user.email_verified) return "unverified";
  if (me.active_workspace === null) return "no-workspace";
  return "ready";
}

export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  try {
    return await api.get<Me>("/auth/me", signal);
  } catch {
    return null;
  }
}
