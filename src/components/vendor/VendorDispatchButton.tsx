"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * "Dispatch order" — the vendor's entire workflow, as one button.
 *
 * There is nothing to accept, nothing to mark preparing and nothing to
 * mark ready. A vendor is told about an order and sends it, and the only
 * control they are given is the one that says so.
 *
 * The token in the URL is the credential (see the route's own comment),
 * so this posts to `/api/v1/vendor/fulfilments/{token}/dispatch` with no
 * session and no headers. It is the only write any unauthenticated
 * caller can make in this application.
 *
 * On success it refreshes rather than updating local state: the page's
 * badge, its dispatched-at line and whether this button should exist at
 * all are server-rendered from one read, and a second copy of that
 * judgement here would be the thing that goes stale.
 */
export function VendorDispatchButton({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function dispatch() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/vendor/fulfilments/${encodeURIComponent(token)}/dispatch`,
        { method: "POST" },
      );
      const body = await res.json();

      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not dispatch this order. Please call Quoin.");
        return;
      }

      /* `changed: false` means this leg was already dispatched — the
         button was pressed twice, or the page was left open. From the
         vendor's point of view that is done, not an error, and saying
         "failed" would make them send the goods a second time. */
      toast.success(
        body.data.changed ? "Thank you — marked as dispatched" : "This order was already dispatched",
      );
      router.refresh();
    } catch {
      toast.error("Network error — nothing was sent. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button onClick={dispatch} loading={saving} disabled={saving} size="lg" className="w-full">
      Dispatch order
    </Button>
  );
}
