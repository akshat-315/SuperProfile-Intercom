"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { fetchMe } from "@/lib/session";

type State = "checking" | "done" | "failed";

export default function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auth
      .verify(token)
      .then(() => {
        if (cancelled) return;
        setState("done");
      })
      .catch((problem) => {
        if (cancelled) return;
        setMessage(
          problem instanceof ApiError ? problem.message : "That link could not be checked.",
        );
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function carryOn() {
    setBusy(true);
    const me = await fetchMe();
    router.replace(me === null ? ROUTES.login : ROUTES.welcome);
  }

  if (state === "checking") {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
      </Card>
    );
  }

  if (state === "failed") {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="size-5 text-destructive" aria-hidden />
          </div>
          <CardTitle className="text-xl font-semibold tracking-[-0.024em]">This link has expired</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SubmitButton busy={busy} className="w-full" onClick={carryOn}>
            Send me a new one
          </SubmitButton>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => router.replace(ROUTES.login)}>
            Sign in instead
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
          <CheckCircle2 className="size-5" aria-hidden />
        </div>
        <CardTitle className="text-xl font-semibold tracking-[-0.024em]">Email confirmed</CardTitle>
        <CardDescription>You can carry on setting up your workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <SubmitButton busy={busy} className="w-full" onClick={carryOn}>
          Continue
        </SubmitButton>
      </CardContent>
    </Card>
  );
}
