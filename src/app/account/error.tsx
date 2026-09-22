"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * The account area's own error boundary.
 *
 * `unstable_retry`, not `reset` — see the note on the root
 * `src/app/error.tsx`: the prop was renamed in Next 16, and the old name
 * arrives as `undefined` here, which would turn "Try again" into a button
 * that throws when pressed.
 *
 * Deliberately minimal markup rather than `AccountShell` — the error
 * boundary has to render even when whatever a page was reading (a
 * session, a user row) is the thing that failed, and `AccountShell`
 * itself reads the session through `AppShell`.
 */
export default function AccountError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[quoin] account area render error", error);
  }, [error]);

  return (
    <div className="px-5 py-16 lg:px-6">
      <ErrorState
        title="We couldn't load this page."
        retry={unstable_retry}
        digest={error.digest}
      />
    </div>
  );
}
