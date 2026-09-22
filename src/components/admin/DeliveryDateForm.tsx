"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";

/**
 * The delivery day a person at Quoin is actually committing to —
 * `Order.expectedDeliveryOn`. There is deliberately no way to compute
 * this from a lead time or a fulfilment type; it is set here, by a
 * person, or it stays null and the customer sees "Date confirmed on
 * call" (`src/lib/data/order-history.ts`, `OrderCard`, the order detail
 * page).
 *
 * `router.refresh()` on success rather than trusting the typed value as
 * the new state — the same discipline `OrderStatusForm` and
 * `OfflinePaymentForm` follow, so this card, the order summary above it
 * and anything else on the page reading `expectedDeliveryOn` all move
 * together off one server read.
 */
export function DeliveryDateForm({
  reference,
  expectedDeliveryOn,
}: {
  reference: string;
  /** `YYYY-MM-DD`, or null when nothing is set yet. */
  expectedDeliveryOn: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(expectedDeliveryOn ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/delivery-date`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: next }),
        },
      );
      const body = await res.json();

      if (!res.ok) {
        setError(body?.error?.message ?? "Could not update the delivery date");
        return;
      }

      setDate(next ?? "");
      toast.success(next ? "Delivery date saved" : "Delivery date cleared");
      router.refresh();
    } catch {
      setError("Network error — the delivery date was not updated");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label="Expected delivery date"
        htmlFor="delivery-date"
        hint="Leave blank and clear it to say “Date confirmed on call”."
      >
        <Input
          id="delivery-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      {error && <InlineError>{error}</InlineError>}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => submit(date)} loading={saving} disabled={saving || !date}>
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit(null)}
          loading={saving}
          disabled={saving}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
