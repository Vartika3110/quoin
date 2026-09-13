"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Check } from "@/components/icons";
import type { LineStock } from "@/lib/cart/availability";
import type { StockAlertOutcome } from "@/lib/cart/use-cart-stock";

/**
 * The out-of-stock treatment for a cart line, borrowed from how fashion
 * apps handle a sold-out size: the state is on the picture, where the eye
 * lands first, rather than in a sentence under the price.
 */

/** Laid over the product image. The parent must be `relative`. A line
    that is merely short keeps its picture — some of it can still be
    bought, and a "sold out" stamp would say otherwise. */
export function StockImageOverlay({ stock }: { stock: LineStock }) {
  if (stock.state !== "out_of_stock" && stock.state !== "unavailable") return null;

  return (
    <span className="absolute inset-0 grid place-items-center bg-surface/70 p-1">
      <span className="rounded-full bg-deep px-2 py-0.5 text-center text-[0.625rem] font-semibold uppercase leading-tight tracking-wide text-on-deep">
        {stock.state === "out_of_stock" ? "Out of stock" : "No longer sold"}
      </span>
    </span>
  );
}

/**
 * What a blocked line offers instead of a quantity stepper. Shared by the
 * cart page and the drawer so the two cannot word the same state
 * differently. Removal stays with each view, which styles it its own way.
 */
export function LineStockActions({
  stock,
  requested,
  onRequest,
  onShrink,
}: {
  stock: LineStock;
  requested: boolean;
  onRequest: () => Promise<StockAlertOutcome>;
  onShrink: (qty: number) => void;
}) {
  switch (stock.state) {
    case "out_of_stock":
      return <NotifyMe requested={requested} onRequest={onRequest} />;
    case "short":
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="nums text-micro font-medium text-warning">
            Only {stock.available} left
          </span>
          <Button variant="outline" size="sm" onClick={() => onShrink(stock.available)}>
            Change to {stock.available}
          </Button>
        </div>
      );
    case "unavailable":
      return (
        <p className="min-w-0 text-micro text-muted">
          No longer sold. Remove it to check out.
        </p>
      );
    default:
      return null;
  }
}

/**
 * "Notify me", and what it became.
 *
 * The confirmation says who acts, because nothing is sent automatically:
 * the request lands on the admin inventory page and a person contacts the
 * customer when stock is received.
 */
export function NotifyMe({
  requested,
  onRequest,
}: {
  requested: boolean;
  onRequest: () => Promise<StockAlertOutcome>;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const [saving, setSaving] = useState(false);

  if (requested) {
    return (
      <p className="flex min-w-0 items-start gap-1.5 text-micro leading-snug text-success">
        <Check className="mt-px size-3.5 shrink-0" />
        Request saved. Our team will contact you when it is back in stock.
      </p>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      loading={saving}
      onClick={async () => {
        setSaving(true);
        const outcome = await onRequest();
        if (outcome.kind === "signin") {
          window.location.href = `/signin?next=${encodeURIComponent(pathname)}`;
          return;
        }
        setSaving(false);
        if (outcome.kind === "error") toast.error(outcome.message);
      }}
    >
      Notify me
    </Button>
  );
}
