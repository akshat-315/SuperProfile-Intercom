"use client";

import { XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { type InvitePreview, invites } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { type Me, fetchMe, stageOf } from "@/lib/session";

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [dead, setDead] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([invites.preview(code).catch((p) => p as ApiError), fetchMe()])
      .then(([found, who]) => {
        if (found instanceof ApiError) setDead(found.message);
        else setPreview(found);
        setMe(who);
      })
      .finally(() => setLoading(false));
  }, [code]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await invites.join(code);
      router.replace(ROUTES.inbox);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Could not join.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
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

  if (dead !== null || preview === null) {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="size-5 text-destructive" aria-hidden />
          </div>
          <CardTitle className="text-xl font-semibold tracking-[-0.024em]">This invitation cannot be used</CardTitle>
          <CardDescription>{dead ?? "Ask whoever invited you for a new one."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" asChild>
            <Link href={ROUTES.login}>Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stage = stageOf(me);
  const header = (
    <CardHeader>
      <CardTitle className="text-xl font-semibold tracking-[-0.024em]">Join {preview.workspace_name}</CardTitle>
      <CardDescription>
        {preview.inviter_name} invited {preview.email} as{" "}
        <Badge variant="secondary">{preview.role}</Badge>
      </CardDescription>
    </CardHeader>
  );

  if (stage === "signed-out") {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
        {header}
        <CardContent className="space-y-3">
          <Button className="w-full" asChild>
            <Link href={`${ROUTES.signup}?invite=${encodeURIComponent(code)}`}>
              Create an account
            </Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href={ROUTES.login}>I already have one</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (stage === "unverified") {
    return (
      <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
        {header}
        <CardContent className="space-y-3">
          <p className="text-sm text-ink-500">
            Confirm your email address first, then come back to this link.
          </p>
          <Button className="w-full" asChild>
            <Link href={ROUTES.welcome}>Confirm my email</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
      {header}
      <CardContent className="space-y-3">
        <FormError message={error} />
        <SubmitButton busy={busy} className="w-full" onClick={join}>
          Join {preview.workspace_name}
        </SubmitButton>
      </CardContent>
    </Card>
  );
}
