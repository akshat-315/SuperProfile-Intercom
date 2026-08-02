"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ROUTES, whereTo } from "@/lib/routes";

const MIN_PASSWORD = 8;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(params.get("invite") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await auth.signup({
        name,
        email,
        password,
        ...(code.trim() ? { invite_code: code.trim() } : {}),
      });
      router.replace(whereTo(me));
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-[-0.024em]">Create your account</CardTitle>
        <CardDescription>You will pick a workspace next.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-ink-500">At least {MIN_PASSWORD} characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite">
              Invite code <span className="text-ink-500">(optional)</span>
            </Label>
            <Input
              id="invite"
              placeholder="K7M2-QP94"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <FormError message={error} />
          <SubmitButton busy={busy} type="submit" className="h-11 w-full rounded-[10px] text-sm font-semibold">
            Create account
          </SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-ink-500">
          Already have one?{" "}
          <Link href={ROUTES.login} className="font-medium text-brand-600 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
