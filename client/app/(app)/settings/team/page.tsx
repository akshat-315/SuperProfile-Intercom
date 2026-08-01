"use client";

import { AnimatePresence, motion } from "motion/react";
import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { type Member, team } from "@/lib/auth";
import { type Me, fetchMe } from "@/lib/session";

export default function TeamPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [who, list] = await Promise.all([fetchMe(), team.list()]);
    setMe(who);
    setMembers(list.members);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = me?.role === "admin";

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invite = await team.invite({ email, role });
      setLastCode(invite.code);
      setEmail("");
      toast.success("Invitation sent", { description: `${invite.email} can join as ${invite.role}.` });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not send it.");
    } finally {
      setBusy(false);
    }
  }

  async function change(userId: number, next: string) {
    try {
      await team.setRole(userId, next);
      await load();
      toast.success("Role updated");
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not change the role.");
    }
  }

  async function drop(userId: number) {
    setMembers((current) => current?.filter((m) => m.user_id !== userId) ?? null);
    try {
      await team.remove(userId);
      toast.success("Removed from the workspace");
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not remove them.");
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Who is in this workspace, and what they can do.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite someone</CardTitle>
            <CardDescription>They get an email with a link and a code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={sendInvite} className="flex flex-wrap gap-2">
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="email" className="sr-only">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="colleague@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <SubmitButton busy={busy} type="submit">
                Send invite
              </SubmitButton>
            </form>
            <FormError message={error} />
            <AnimatePresence>
              {lastCode !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <span className="font-mono text-sm">{lastCode}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(lastCode);
                        toast.success("Code copied");
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      Copy
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {members === null && <Skeleton className="h-14 w-full" />}
          <AnimatePresence initial={false}>
            {members?.map((member) => (
              <motion.div
                key={member.user_id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between gap-3 overflow-hidden border-b py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.name}
                    {member.user_id === me?.user.id && (
                      <span className="ml-2 text-xs text-muted-foreground">you</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!member.email_verified && <Badge variant="outline">unconfirmed</Badge>}
                  {isAdmin ? (
                    <Select value={member.role} onValueChange={(next) => change(member.user_id, next)}>
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{member.role}</Badge>
                  )}
                  {isAdmin && member.user_id !== me?.user.id && (
                    <Button variant="ghost" size="sm" onClick={() => drop(member.user_id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
