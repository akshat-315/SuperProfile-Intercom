"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { team, workspaces } from "@/lib/auth";
import { whereTo } from "@/lib/routes";
import { fetchMe } from "@/lib/session";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((me) => setName(me?.active_workspace?.name ?? ""));
  }, []);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await workspaces.rename(name);
      toast.success("Workspace renamed");
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not rename it.");
    } finally {
      setBusy(false);
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="text-sm text-ink-500">Its name, and how to leave it.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
          <CardDescription>Everyone in the workspace sees this.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={rename} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name" className="sr-only">
                Workspace name
              </Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <SubmitButton busy={busy} type="submit">
              Save
            </SubmitButton>
          </form>
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
