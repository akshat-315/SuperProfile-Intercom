"use client";

import { ArrowUpRight, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyField } from "@/components/copy-field";
import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { type Setup, team, workspaces } from "@/lib/auth";
import { ROUTES, whereTo } from "@/lib/routes";
import { type Me, fetchMe } from "@/lib/session";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const admin = me?.role === "admin";

  useEffect(() => {
    Promise.all([fetchMe(), workspaces.setup().catch(() => null)])
      .then(([who, install]) => {
        setMe(who);
        setName(who?.active_workspace?.name ?? "");
        setSetup(install);
      })
      .finally(() => setLoading(false));
  }, []);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    setRenaming(true);
    setError(null);
    try {
      await workspaces.rename(name);
      toast.success("Workspace renamed");
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not rename it.");
    } finally {
      setRenaming(false);
    }
  }

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      const result = await team.leave();
      toast.success(result.workspace_deleted ? "Workspace deleted" : "You left the workspace");
      router.replace(whereTo(await fetchMe()));
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not leave.");
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-ink-500">
          How customers reach {me?.active_workspace?.name ?? "this workspace"}, and who works in it.
        </p>
      </div>

      {/* Setup comes first: a new workspace cannot be used at all until these
          two values leave the database, and until now nothing showed them. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup</CardTitle>
          <CardDescription>
            The two ways a customer can reach you. Both are ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {setup === null ? (
            <p className="text-sm text-ink-500">
              Could not load your install details. Refresh the page to try again.
            </p>
          ) : (
            <>
              <CopyField
                label="Chat widget"
                value={setup.install_snippet}
                wrap
                hint="Paste this into your site's HTML, just before the closing </body> tag. The chat button appears in the bottom right."
              />
              <CopyField
                label="Widget key"
                value={setup.widget_key}
                hint="The same key on its own, for the demo page or any installer that asks for it. It is public by design."
              />
              {setup.support_email ? (
                <CopyField
                  label="Support email"
                  value={setup.support_email}
                  hint="Anything sent here becomes a conversation in your inbox. Replies go back out as real email."
                />
              ) : (
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Support email</span>
                  <p className="text-xs text-ink-500">
                    Not available — inbound email is not configured on this installation.
                  </p>
                </div>
              )}
              <CopyField
                label="Help centre"
                value={setup.help_url}
                hint="Your published articles, readable by anyone. Link to it from your site."
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace</CardTitle>
          <CardDescription>
            {admin ? "Everyone in the workspace sees this name." : "Only an admin can change this."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={rename} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name" className="sr-only">
                Workspace name
              </Label>
              <Input
                id="name"
                required
                value={name}
                disabled={!admin}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {admin && (
              <SubmitButton busy={renaming} type="submit">
                Save
              </SubmitButton>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>Invite people, change what they can do, remove them.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={ROUTES.team}>
              <Users className="size-4" />
              Manage team
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Leave this workspace</CardTitle>
          <CardDescription>
            If you are the last person in it, the workspace and everything in it is deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormError message={error} />
          <Button variant="destructive" disabled={leaving} onClick={leave}>
            {leaving ? "Leaving…" : "Leave workspace"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
