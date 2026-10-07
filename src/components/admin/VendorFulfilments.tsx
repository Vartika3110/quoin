"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/types/catalog";
import type { FulfilmentDetail } from "@/lib/data/order-fulfilments";

/**
 * The vendor cards on the admin order page — who has to pick what, and
 * whether they have.
 *
 * On a single-store order this is one card and mostly reassurance. On an
 * order split across stores it is the thing that stops a wrong answer
 * being given on the phone: each store's own items, its own total, its
 * own dispatch state, and the "Dispatch" button for the store that
 * phoned rather than tapping the link in its WhatsApp.
 *
 * **It cannot dispatch the whole order.** Each button posts to that one
 * leg, and the order itself moves to DISPATCHED only when the last
 * outstanding leg does — decided server-side by `dispatchOrderLeg`
 * (`src/lib/data/order-dispatch.ts`), never here. A staff member who
 * wants to move the order regardless still has "Change status" in the
 * sidebar; this control is deliberately narrower than that one.
 *
 * A client component for the buttons alone. Everything rendered is a prop
 * from the server's own projection, and a dispatch calls
 * `router.refresh()` rather than updating local state: the status badge,
 * the timeline, the WhatsApp activity and the set of legal next statuses
 * are all server-rendered from the same read, and re-deriving any of them
 * here would be a second copy of that shape going stale.
 */
export function VendorFulfilments({
  reference,
  fulfilments,
}: {
  reference: string;
  fulfilments: FulfilmentDetail[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (fulfilments.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        No vendor is assigned to this order. Nothing in the basket reserved stock from a store —
        a callback order, a made-to-order item, or an untracked product — so Quoin fulfils it
        directly. Use “Change status” to dispatch it.
      </p>
    );
  }

  async function dispatch(fulfilmentId: string, storeName: string) {
    setBusy(fulfilmentId);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/fulfilments/${encodeURIComponent(fulfilmentId)}/dispatch`,
        { method: "POST" },
      );
      const body = await res.json();

      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not dispatch this vendor's items");
        return;
      }

      if (body.data.orderAdvanced) {
        toast.success(`Order dispatched — the customer has been notified`);
      } else if (body.data.outstandingLegs > 0) {
        /* The honest message on a split order: this leg is away, the
           customer has *not* been told, and here is what we are waiting
           on. Telling them "order dispatched" would be the exact
           untruth the per-vendor model exists to prevent. */
        toast.success(
          `${storeName} dispatched — waiting on ${body.data.outstandingLegs} other vendor${
            body.data.outstandingLegs === 1 ? "" : "s"
          }`,
        );
      } else {
        toast.success(`${storeName} dispatched`);
      }
      router.refresh();
    } catch {
      toast.error("Network error — nothing was dispatched");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-4">
      {fulfilments.map((fulfilment) => (
        <li
          key={fulfilment.id}
          className="border-b border-line-hair pb-4 text-body-sm last:border-0 last:pb-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-ink">{fulfilment.storeName}</span>
            <Badge
              tone={
                fulfilment.status === "DISPATCHED"
                  ? "success"
                  : fulfilment.status === "CANCELLED"
                    ? "neutral"
                    : "warning"
              }
              size="sm"
            >
              {fulfilment.status === "DISPATCHED"
                ? "Dispatched"
                : fulfilment.status === "CANCELLED"
                  ? "Cancelled"
                  : "Awaiting dispatch"}
            </Badge>
          </div>

          <p className="nums mt-0.5 text-caption text-muted">
            {fulfilment.storeCode}
            {" · "}
            {/* The number the vendor message was addressed to. Shown in
                full, not masked, because this is a business contact a
                staff member may need to ring — unlike a customer's
                number, which is masked across the admin. */}
            {fulfilment.vendorPhone ?? "no WhatsApp number on file"}
          </p>

          <ul className="mt-2 space-y-1">
            {fulfilment.lines.map((line) => (
              <li key={line.sku} className="nums flex justify-between gap-3 text-caption">
                <span className="min-w-0 text-muted">
                  {line.qty} × {line.title}
                  <span className="text-faint"> · {line.sku}</span>
                </span>
                <span className="shrink-0 text-ink">{formatPrice(line.linePaise)}</span>
              </li>
            ))}
          </ul>

          <p className="nums mt-2 text-caption text-muted">
            {/* This store's share, which on a split order is not the
                order total — see `sendVendorOrder`. */}
            Vendor subtotal {formatPrice(fulfilment.subtotalPaise)}
          </p>

          {fulfilment.status === "DISPATCHED" && fulfilment.dispatchedAt && (
            <p className="mt-1 text-caption text-muted">
              Dispatched {DATE_TIME_FORMAT.format(new Date(fulfilment.dispatchedAt))}
              {" by "}
              {/* Null means the vendor used their own WhatsApp link —
                  there is no vendor account to name. Not "unknown". */}
              {fulfilment.dispatchedByName ?? fulfilment.storeName}
            </p>
          )}

          {fulfilment.status === "PENDING" && (
            <Button
              onClick={() => dispatch(fulfilment.id, fulfilment.storeName)}
              loading={busy === fulfilment.id}
              disabled={busy !== null}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Dispatch {fulfilment.storeName}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
