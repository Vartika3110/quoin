"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * The board's one-tap advance.
 *
 * Posts through the exact same route `OrderStatusForm` uses
 * (`POST /api/v1/admin/orders/{reference}/status`,
 * `src/app/api/v1/admin/orders/[reference]/status/route.ts`) — this is
 * not a second write path, just a second, narrower caller of the first
 * one. `toStatus` is computed server-side (`AdminBoardCard.nextStatus`,
 * `src/lib/data/admin-board.ts`) via the same `isAdminTransitionAllowed`
 * the detail page's form is built from, so this component never has to
 * decide whether a move is legal, only display the one the server already
 * cleared.
 */
export function BoardAdvanceButton({
  reference,
  toStatus,
  label,
}: {
  reference: string;
  toStatus: OrderStatus;
  label: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/orders/${encodeURIComponent(reference)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      const body = await res.json();

      if (!res.ok) {
        /* A 409 here is almost always the race guard — someone else's tap
           already moved this order, or it moved the moment a page was
           refreshed. The server's own message says which. */
        toast.error(body?.error?.message ?? "Could not update this order");
        return;
      }

      toast.success(`${reference} → ${label}`);
      router.refresh();
    } catch {
      toast.error("Network error — the order was not updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button size="sm" variant="subtle" block onClick={submit} loading={saving} disabled={saving}>
      {label}
    </Button>
  );
}
