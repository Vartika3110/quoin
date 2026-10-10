"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CheckRow, Field, Input } from "@/components/ui/Input";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/types/catalog";
import {
  planRefund,
  refundEmptiesPayment,
  type RefundMode,
} from "@/lib/orders/refund-input";

/**
 * "Refund" — the only way money goes back to a customer.
 *
 * It exists because the alternative was being used instead. Order
 * QO-P8498W was cancelled ninety-four seconds after ₹5,200 had been
 * captured against it: there was no refund control anywhere in this
 * admin, so the nearest available button was the status dropdown, and a
 * cancelled order says nothing at all about the money. The transition
 * table now refuses that move and `POST .../refund` is where the path
 * leads — but an endpoint nothing calls is one a person has to reach with
 * `curl`, which in practice means they reach for the dropdown again.
 *
 * Shaped after `OfflinePaymentForm`, deliberately, because it is the same
 * kind of action in the opposite direction: a real amount, a reason, and a
 * checkbox that is never pre-ticked. `disabled` on the submit button is
 * the only thing between a staff member skimming this page and money
 * leaving the account.
 *
 * `refundablePaise` is computed server-side from the captured payment less
 * everything already refunded against it. `refundOrder`
 * (`src/lib/data/orders.ts`) re-derives it regardless of what this sends
 * and refuses anything above it; this is here so the person can see what
 * is left rather than discover it in an error.
 *
 * Refreshes the server tree on success rather than updating local state —
 * the refunds list, the status badge and the status history are all
 * rendered from the same `getAdminOrder` read, for the reason
 * `OrderStatusForm` records.
 */
const MODES: TabItem<RefundMode>[] = [
  { id: "full", label: "Everything left" },
  { id: "partial", label: "Part of it" },
];

export function RefundForm({
  reference,
  refundablePaise,
  alreadyRefundedPaise,
}: {
  reference: string;
  refundablePaise: number;
  /** Non-zero when this is a second refund against the same payment. */
  alreadyRefundedPaise: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<RefundMode>("full");
  const [rupees, setRupees] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* What has been asked for, and what to say about it — `planRefund`
     (`src/lib/orders/refund-input.ts`), which is pure and tested, because
     "blank", "0", "12,500.50" and "more than is left" are the four
     answers that matter and none of them should need a browser to check.
     The rupee parser underneath it is the same one the quote form uses,
     so a typed figure means the same thing in both places and neither
     becomes a float on the way to paise. */
  const { amountPaise, problem: typedProblem } = planRefund({
    mode,
    typed: rupees,
    refundablePaise,
  });
  const isFull = refundEmptiesPayment(amountPaise, refundablePaise);

  async function submit() {
    if (amountPaise === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/refund`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            /* Omitted for a full refund rather than sent as the figure
               rendered here: the server works out what is outstanding
               from the payment at the moment it runs, which is the right
               answer if another refund landed while this page was open. */
            amountPaise: mode === "partial" ? amountPaise : undefined,
            reason: reason.trim() || undefined,
          }),
        },
      );
      const body = await res.json();

      if (!res.ok) {
        /* Inline, not a toast. The gateway case tells staff to check the
           Razorpay dashboard before trying again — see the handler in
           `.../refund/route.ts` — and that is not a message to show for
           four seconds and take away. */
        setError(body?.error?.message ?? "Could not refund this order");
        return;
      }

      toast.success(
        body?.data?.status === "PROCESSED"
          ? `${formatPrice(amountPaise)} refunded`
          : `${formatPrice(amountPaise)} refund started — the bank can take a few days`,
      );
      setConfirmed(false);
      setRupees("");
      setReason("");
      router.refresh();
    } catch {
      setError("Network error — no refund was sent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="nums text-title-lg font-semibold text-ink">
        {formatPrice(refundablePaise)}
        <span className="ml-2 text-caption font-normal text-muted">
          {alreadyRefundedPaise > 0
            ? `left to refund · ${formatPrice(alreadyRefundedPaise)} already returned`
            : "available to refund"}
        </span>
      </p>

      <div>
        <span className="mb-1.5 block text-caption font-medium text-ink">Refund</span>
        <Tabs
          items={MODES}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setConfirmed(false);
          }}
          label="How much to refund"
          variant="segmented"
          className="w-full"
        />
      </div>

      {mode === "partial" && (
        <Field
          label="Amount in rupees"
          htmlFor="refund-amount"
          hint={`Up to ${formatPrice(refundablePaise)}`}
          error={typedProblem ?? undefined}
        >
          <Input
            id="refund-amount"
            value={rupees}
            onChange={(e) => {
              setRupees(e.target.value);
              setConfirmed(false);
            }}
            inputMode="decimal"
            maxLength={12}
            placeholder="5200"
            aria-invalid={typedProblem ? true : undefined}
            aria-describedby="refund-amount-msg"
          />
        </Field>
      )}

      <Field
        label="Reason"
        htmlFor="refund-reason"
        hint="Recorded against the refund, for whoever reads this order next"
      >
        <Input
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={400}
          placeholder="Optional — e.g. two slabs cracked in transit"
        />
      </Field>

      {/* What this will do to the order, which is not the same for the two
          amounts. A refund of everything outstanding moves the order to
          Refund pending and then to Refunded once the gateway confirms; a
          part refund deliberately leaves the order where it is, because
          both of those statuses are claims about the whole of what was
          paid and the order is still being fulfilled. */}
      <p className="rounded-lg bg-surface px-3 py-2 text-caption text-muted">
        {isFull
          ? "The order moves to Refund pending, then to Refunded when the gateway confirms the money has gone back."
          : "The order keeps its current status — a part refund is recorded against the payment, not the order."}
      </p>

      <CheckRow
        label={
          amountPaise === null
            ? "Enter an amount to refund"
            : `Send ${formatPrice(amountPaise)} back to the customer`
        }
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
        disabled={amountPaise === null}
        className="bg-surface"
      />

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <Button
        onClick={submit}
        loading={saving}
        disabled={saving || !confirmed || amountPaise === null}
        block
      >
        {amountPaise === null ? "Refund" : `Refund ${formatPrice(amountPaise)}`}
      </Button>
    </div>
  );
}
