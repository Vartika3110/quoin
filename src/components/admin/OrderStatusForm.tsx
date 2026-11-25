"use client";

import type { OrderStatus } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export interface OrderStatusOption {
  value: string;
  label: string;
}

/**
 * The one control that changes what happens to an order.
 *
 * `options` is computed server-side by `legalNextStatuses`
 * (`src/lib/data/admin-orders.ts`) and passed in as plain data — this
 * component never imports that module itself. It is a client component
 * (Prisma has no business in a browser bundle), so the set of legal moves
 * has to arrive as a prop rather than be recomputed here; the alternative
 * is a second, hand-copied idea of the state machine drifting from the
 * one `transitionOrderStatus` actually enforces. `PAID` is never in
 * `options` at all — see `isAdminTransitionAllowed` — so there is no way
 * to select it, not just a rejection after the fact.
 *
 * On success this calls `router.refresh()` rather than updating local
 * state: the audit trail, the new status badge and the next set of legal
 * moves are all server-rendered from the same read, and re-deriving them
 * here would be a second copy of `getAdminOrder`'s shape that can go
 * stale.
 */
/**
 * What to say when there is no move to offer, which is not one thing.
 *
 * The form used to print "This order is in a terminal state — there is
 * nowhere further to move it" whenever `options` was empty. For
 * `CANCELLED` and `REFUNDED` that is true. For **`REFUND_PENDING` it is
 * false in the way that matters**: that order is waiting for the
 * gateway's `refund.processed` to carry it to `REFUNDED`, and it is the
 * one status in this system that means *this customer is owed money*.
 * Calling it terminal invites reading it as settled.
 *
 * The emptiness itself is correct and deliberate —
 * `isAdminTransitionAllowed` refuses `REFUNDED` from the dropdown
 * precisely so that it can only ever arrive with a `Refund` row behind
 * it. So this is the wording catching up with the behaviour, not a
 * change to it.
 */
function nothingToDoHere(status: OrderStatus): string {
  if (status === "REFUND_PENDING") {
    return (
      "A refund has been agreed and not yet settled. This order moves to " +
      "Refunded by itself when the gateway confirms it — it cannot be set " +
      "from here, so that “refunded” always has a refund behind it."
    );
  }
  if (status === "REFUNDED") return "This order has been refunded. Nothing further.";
  if (status === "CANCELLED") return "This order was cancelled. Nothing further.";
  return "There is no status this order can be moved to from here.";
}

export function OrderStatusForm({
  reference,
  status,
  options,
}: {
  reference: string;
  /** The order's current status, which decides the empty-state wording. */
  status: OrderStatus;
  options: OrderStatusOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [toStatus, setToStatus] = useState(options[0]?.value ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (options.length === 0) {
    return (
      <p className="text-body-sm text-muted">{nothingToDoHere(status)}</p>
    );
  }

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus, note: note.trim() || undefined }),
        },
      );
      const body = await res.json();

      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not update this order");
        return;
      }

      const label = options.find((o) => o.value === toStatus)?.label ?? toStatus;
      toast.success(`Moved to ${label}`);
      setNote("");
      router.refresh();
    } catch {
      toast.error("Network error — the order was not updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">Move to</span>
        <Select value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">
          Note <span className="font-normal text-faint">(optional)</span>
        </span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Why, or anything the next person handling this should know"
        />
      </label>

      <Button onClick={submit} loading={saving} disabled={saving}>
        Update status
      </Button>
    </div>
  );
}
