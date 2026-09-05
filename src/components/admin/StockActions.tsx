"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

type Mode = "adjust" | "receive" | "return";

const TABS: TabItem<Mode>[] = [
  { id: "adjust", label: "Adjust" },
  { id: "receive", label: "Receive" },
  { id: "return", label: "Return" },
];

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "done" };

/**
 * The three things a warehouse actually does to one item, as one panel.
 *
 * Refreshes the server component tree (`router.refresh()`) on success
 * rather than updating local state with the response body: the numbers
 * that have to stay correct here — on-hand, reserved, the whole movement
 * history below — are computed server-side from the row the write just
 * changed, and restating that arithmetic on the client is exactly the
 * kind of second copy that eventually disagrees with the first.
 */
export function StockActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("adjust");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [returnQty, setReturnQty] = useState("");
  const [returnOrder, setReturnOrder] = useState("");

  async function submit(path: string, body: unknown) {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch(`/api/v1/admin/inventory/${itemId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();

      if (!res.ok) {
        const fields = payload?.error?.fields as Record<string, string> | undefined;
        setStatus({
          kind: "error",
          message: fields ? Object.values(fields)[0] : (payload?.error?.message ?? "Could not save"),
        });
        return;
      }

      setStatus({ kind: "done" });
      setAdjustQty("");
      setAdjustReason("");
      setReceiveQty("");
      setReturnQty("");
      setReturnOrder("");
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error — not saved" });
    }
  }

  const saving = status.kind === "saving";
  const digitsOnly = (v: string) => v.replace(/\D/g, "");
  const signedDigits = (v: string) => v.replace(/[^-\d]/g, "");

  return (
    <div>
      <Tabs
        items={TABS}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setStatus({ kind: "idle" });
        }}
        label="Stock action"
        variant="segmented"
      />

      <div className="mt-4">
        {mode === "adjust" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Quantity change"
              htmlFor="adjust-qty"
              hint="Positive to add, negative to correct down"
            >
              <Input
                id="adjust-qty"
                inputMode="numeric"
                value={adjustQty}
                onChange={(e) => setAdjustQty(signedDigits(e.target.value))}
                className="w-32"
              />
            </Field>
            <Field label="Reason" htmlFor="adjust-reason" required className="min-w-[240px] flex-1">
              <Input
                id="adjust-reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Stock count, breakage, audit correction…"
              />
            </Field>
            <Button
              disabled={saving || !adjustQty || Number(adjustQty) === 0 || !adjustReason.trim()}
              loading={saving}
              onClick={() => submit("adjust", { qty: Number(adjustQty), reason: adjustReason })}
            >
              Save adjustment
            </Button>
          </div>
        )}

        {mode === "receive" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Quantity received" htmlFor="receive-qty">
              <Input
                id="receive-qty"
                inputMode="numeric"
                value={receiveQty}
                onChange={(e) => setReceiveQty(digitsOnly(e.target.value))}
                className="w-32"
              />
            </Field>
            <Button
              disabled={saving || !receiveQty || Number(receiveQty) <= 0}
              loading={saving}
              onClick={() => submit("receive", { qty: Number(receiveQty) })}
            >
              Record receipt
            </Button>
          </div>
        )}

        {mode === "return" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Quantity returned" htmlFor="return-qty">
              <Input
                id="return-qty"
                inputMode="numeric"
                value={returnQty}
                onChange={(e) => setReturnQty(digitsOnly(e.target.value))}
                className="w-32"
              />
            </Field>
            <Field label="Order reference" htmlFor="return-order" hint="e.g. ORD-4K7QRT">
              <Input
                id="return-order"
                value={returnOrder}
                onChange={(e) => setReturnOrder(e.target.value.toUpperCase())}
                className="w-40"
              />
            </Field>
            <Button
              disabled={saving || !returnQty || Number(returnQty) <= 0 || !returnOrder.trim()}
              loading={saving}
              onClick={() => submit("return", { qty: Number(returnQty), orderReference: returnOrder })}
            >
              Record return
            </Button>
          </div>
        )}

        {status.kind === "error" && (
          <p className="mt-2 text-body-sm text-danger">{status.message}</p>
        )}
        {status.kind === "done" && (
          <p className="mt-2 text-body-sm text-success">Saved — the history below now reflects it.</p>
        )}
      </div>
    </div>
  );
}
