import { api } from "@/lib/api";
import type { components } from "@/lib/types";
import type { Me } from "@/lib/session";

export type InvitePreview = components["schemas"]["InvitePreview"];
export type Team = components["schemas"]["TeamResponse"];
export type Member = components["schemas"]["MemberOut"];
export type Invite = components["schemas"]["InviteOut"];
export type VerifyResult = components["schemas"]["VerifyResponse"];
export type Setup = components["schemas"]["SetupOut"];

export const auth = {
  signup: (body: { name: string; email: string; password: string; invite_code?: string }) =>
    api.post<Me>("/auth/signup", body),
  login: (body: { email: string; password: string }) => api.post<Me>("/auth/login", body),
  logout: () => api.post<void>("/auth/logout"),
  resendVerification: () => api.post<void>("/auth/verify/resend"),
  verify: (token: string) => api.post<VerifyResult>(`/auth/verify/${token}`),
  switchWorkspace: (workspace_id: number) => api.post<Me>("/auth/workspace", { workspace_id }),
};

export const workspaces = {
  create: (name: string) => api.post<Me>("/workspaces", { name }),
  rename: (name: string) => api.patch<Me>("/workspaces/current", { name }),
  setup: () => api.get<Setup>("/workspaces/setup"),
};

export const invites = {
  preview: (code: string) => api.get<InvitePreview>(`/invite/${encodeURIComponent(code)}`),
  join: (code: string) => api.post<Me>(`/invite/${encodeURIComponent(code)}`),
};

export const team = {
  list: () => api.get<Team>("/team"),
  invite: (body: { email: string; role: string }) => api.post<Invite>("/team/invite", body),
  setRole: (userId: number, role: string) => api.patch<void>(`/team/${userId}`, { role }),
  remove: (userId: number) => api.delete<void>(`/team/${userId}`),
  leave: () => api.delete<{ workspace_deleted: boolean }>("/team/me"),
};
