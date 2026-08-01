"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type Me, type Stage, fetchMe, stageOf } from "@/lib/session";

const HEADINGS: Record<Stage, string> = {
  "signed-out": "You are signed out",
  unverified: "Confirm your email address",
  "no-workspace": "Create a workspace, or join one",
  ready: "You are in",
};

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal)
      .then(setMe)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const stage = stageOf(me);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{loading ? <Skeleton className="h-6 w-48" /> : HEADINGS[stage]}</CardTitle>
          <CardDescription>
            The screens arrive next. This reads its state from the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {loading ? "…" : JSON.stringify(me ?? { signed_in: false }, null, 2)}
          </pre>
          <Button
            onClick={() => {
              setLoading(true);
              fetchMe()
                .then(setMe)
                .finally(() => setLoading(false));
            }}
          >
            Ask the server again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
