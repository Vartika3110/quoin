"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The app-wide error boundary.
 *
 * `unstable_retry` rather than `reset` — the prop was renamed in Next 16,
 * and the old name silently arrives as `undefined`, which turns "Try
 * again" into a button that throws when pressed.
 *
 * The customer is never shown the error itself. A Prisma message or a
 * stack trace tells them nothing they can act on and tells an attacker
 * something about the schema. The digest is shown, small, because the same
 * hash appears in the server log — it is the difference between a support
 * conversation that can find the error and one that cannot.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[quoin] unhandled render error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-shell items-center px-5 py-16 lg:px-6">
      <div className="w-full">
        <ErrorState
          title="Something went wrong."
          description="This page could not be loaded. It is usually temporary — try again, and if it keeps happening the reference below will help us find it."
          retry={unstable_retry}
          digest={error.digest}
        />
      </div>
    </div>
  );
}
