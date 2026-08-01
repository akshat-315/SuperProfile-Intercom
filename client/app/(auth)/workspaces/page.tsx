"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && me === null) router.replace(ROUTES.login);
  }, [loading, me, router]);

  async function choose(id: number) {
    setSwitching(id);
    await auth.switchWorkspace(id);
    router.replace(ROUTES.inbox);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a workspace</CardTitle>
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
              <span className="text-xs text-muted-foreground">{membership.role}</span>
            </Button>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
