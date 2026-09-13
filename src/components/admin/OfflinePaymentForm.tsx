"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CheckRow, Field, Input, Textarea } from "@/components/ui/Input";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/types/catalog";

type Method = "UPI" | "CASH" | "BANK_TRANSFER" | "CHEQUE";

const METHODS: TabItem<Method>[] = [
  { id: "UPI", label: "UPI" },
  { id: "CASH", label: "Cash" },
  { id: "BANK_TRANSFER", label: "Bank transfer" },
  { id: "CHEQUE", label: "Cheque" },
];

/**
 * "Mark payment received" — the one form that may move a callback order
 * to PAID.
 *
 * Deliberately not one tap. `BoardCard`'s advance button posts a status
 * change with nothing else attached, which is fine for "packed ->
 * dispatched" but wrong for money: this form exists so a real amount, a
 * real method and an optional reference are what actually get sent to
 * `POST .../offline-payment` — see `recordOfflinePayment`,
 * `src/lib/data/orders.ts`, which re-verifies the amount against the
 * order total regardless of what this component sends.
 *
 * The checkbox is required, not decorative: `disabled` on the submit
 * button is the only thing standing between a staff member skimming the
 * page and confirming money that has not actually arrived, so it stays
 * unticked by default and is never pre-checked.
 *
 * Refreshes the server component tree on success rather than updating
 * local state — the new status badge, the payments list and the status
 * history are all server-rendered from the same `getAdminOrder` read that
 * `OrderStatusForm` already relies on for the same reason.
 */
export function OfflinePaymentForm({
  reference,
  totalPaise,
}: {
  reference: string;
  totalPaise: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState<Method>("UPI");
  const [offlineReference, setOfflineReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/offline-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            amountPaise: totalPaise,
            offlineReference: offlineReference.trim() || undefined,
            note: note.trim() || undefined,
          }),
        },
      );
      const body = await res.json();

      if (!res.ok) {
        setError(body?.error?.message ?? "Could not record this payment");
        return;
      }

      toast.success("Payment recorded — order confirmed");
      router.refresh();
    } catch {
      setError("Network error — the payment was not recorded");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="nums text-title-lg font-semibold text-ink">{formatPrice(totalPaise)}</p>

      <div>
        <span className="mb-1.5 block text-caption font-medium text-ink">Method</span>
        <Tabs
          items={METHODS}
          value={method}
          onChange={setMethod}
          label="Payment method"
          variant="segmented"
          className="w-full"
        />
      </div>

      <Field
        label="Reference"
        htmlFor="offline-payment-reference"
        hint="UPI transaction ID, bank reference or receipt number"
      >
        <Input
          id="offline-payment-reference"
          value={offlineReference}
          onChange={(e) => setOfflineReference(e.target.value)}
          maxLength={100}
          placeholder="Optional"
        />
      </Field>

      <label className="block">
        <span className="mb-1.5 block text-caption font-medium text-ink">
          Note <span className="font-normal text-faint">(optional)</span>
        </span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Anything the next person handling this should know"
        />
      </label>

      <CheckRow
        label={`I have received ${formatPrice(totalPaise)} in full`}
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
        className="bg-surface"
      />

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <Button onClick={submit} loading={saving} disabled={saving || !confirmed} block>
        Mark payment received
      </Button>
    </div>
  );
}
