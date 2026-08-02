"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { type Me, fetchMe } from "@/lib/session";

export default function WorkspacesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<number | null>(null);

  const choose = useCallback(
    async (id: number) => {
      setSwitching(id);
      await auth.switchWorkspace(id);
      router.replace(ROUTES.inbox);
    },
    [router],
  );

  useEffect(() => {
    fetchMe()
      .then(async (who) => {
        if (who !== null && who.active_workspace === null && who.memberships.length === 1) {
          await choose(who.memberships[0].workspace.id);
          return;
        }
        setMe(who);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [choose]);

  useEffect(() => {
    if (!loading && me === null) router.replace(ROUTES.login);
  }, [loading, me, router]);

  return (
    <Card className="border border-line shadow-e2 ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-[-0.024em]">Choose a workspace</CardTitle>
        <CardDescription>You belong to more than one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <Skeleton className="h-12 w-full" />}
        {me?.memberships.map((membership, index) => (
          <motion.div
            key={membership.workspace.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.18 }}
          >
            <Button
              variant="outline"
              className="h-auto w-full justify-between px-4 py-3"
              disabled={switching !== null}
              onClick={() => choose(membership.workspace.id)}
            >
              <span className="font-medium">{membership.workspace.name}</span>
              <span className="text-xs text-ink-500">{membership.role}</span>
            </Button>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
