"use client";

import { useState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { workspaces } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Creating already switches the session to the new workspace, so there is
      // nothing to switch afterwards. A full page load rather than a route push,
      // because every cached view belongs to the workspace we just left.
      await workspaces.create(name);
      location.assign(ROUTES.inbox);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not create it.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          setName("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={create}>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              A separate inbox, team and knowledge base. You will be its admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              required
              autoFocus
              maxLength={120}
              placeholder="Acme Support"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <FormError message={error} />
          </div>

          <DialogFooter>
            <SubmitButton busy={busy} type="submit">
              Create workspace
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
