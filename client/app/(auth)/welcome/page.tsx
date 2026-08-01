"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { auth, invites, workspaces } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { type Me, fetchMe, stageOf } from "@/lib/session";

const POLL_MS = 4000;

export default function WelcomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchMe();
    setMe(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stage = stageOf(me);

  useEffect(() => {
    if (loading) return;
    if (stage === "signed-out") router.replace(ROUTES.login);
    if (stage === "ready") router.replace(ROUTES.inbox);
  }, [loading, stage, router]);

  useEffect(() => {
    if (stage !== "unverified") return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [stage, refresh]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.2 }}
      >
        {stage === "unverified" && me !== null && <AwaitingVerification email={me.user.email} />}
        {stage === "no-workspace" && <ChooseWorkspace onDone={refresh} />}
      </motion.div>
    </AnimatePresence>
  );
}

function AwaitingVerification({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await auth.resendVerification();
      toast.success("Sent again", { description: `Check ${email}.` });
    } catch (problem) {
      toast.error(problem instanceof ApiError ? problem.message : "Could not send it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          We sent a link to <span className="font-medium text-foreground">{email}</span>. Open it and
          this page will move on by itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SubmitButton busy={busy} variant="outline" className="w-full" onClick={resend}>
          Send it again
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">
          Nothing yet? Check your spam folder.
        </p>
      </CardContent>
    </Card>
  );
}

function ChooseWorkspace({ onDone }: { onDone: () => Promise<Me | null> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "join", action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      await onDone();
      router.replace(ROUTES.inbox);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your workspace</CardTitle>
        <CardDescription>Start a new one, or join a team that invited you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("create", () => workspaces.create(name));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="workspace">Workspace name</Label>
            <Input
              id="workspace"
              placeholder="Acme Support"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <SubmitButton busy={busy === "create"} type="submit" className="w-full">
            Create workspace
          </SubmitButton>
        </form>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
            or
          </span>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("join", () => invites.join(code.trim()));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="code">Invite code</Label>
            <Input
              id="code"
              placeholder="K7M2-QP94"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <SubmitButton busy={busy === "join"} type="submit" variant="outline" className="w-full">
            Join workspace
          </SubmitButton>
        </form>

        <FormError message={error} />

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={async () => {
            await auth.logout();
            router.replace(ROUTES.login);
          }}
        >
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
