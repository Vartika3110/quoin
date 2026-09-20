"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * `ErrorState` for a server-rendered page whose data read failed.
 *
 * A server component cannot hand `ErrorState` a `retry` function, so this
 * wraps it with the one retry a server page has: render it again. The page
 * decides the sentence ("We couldn't load your orders."); the raw error is
 * logged on the server by the page and never reaches this component.
 */
export function LoadError({ title, compact }: { title: string; compact?: boolean }) {
  const router = useRouter();
  return (
    <ErrorState
      title={title}
      description="This is usually temporary. Check your connection and try again."
      retry={() => router.refresh()}
      compact={compact}
    />
  );
}
