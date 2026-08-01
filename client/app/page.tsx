"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { whereTo } from "@/lib/routes";
import { fetchMe } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetchMe().then((me) => router.replace(whereTo(me)));
  }, [router]);

  return (
    <div className="flex min-h-svh items-center justify-center">
      <Skeleton className="h-8 w-40" />
    </div>
  );
}
