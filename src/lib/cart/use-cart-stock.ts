"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart, type CartLine } from "@/lib/store/cart";
import { lineStock, sellableSubtotal, type LineStock } from "@/lib/cart/availability";
import {
  fetchOpenAlertVariantIds,
  postStockAlert,
  type StockAlertOutcome,
} from "@/lib/stock/request-alert";
import type { Quote } from "@/lib/data/checkout";

export type { StockAlertOutcome };

/**
 * Live stock for the cart the customer is looking at.
 *
 * Asks `/api/v1/checkout/quote` — the same pricing checkout uses — rather
 * than a stock endpoint of its own, so the cart and checkout cannot
 * disagree about what is sellable. `enabled` lets the drawer skip the
 * request while it is closed.
 *
 * The quote is kept against the basket it was fetched for, and ignored
 * once the basket moves on. That is what stops a stale answer about the
 * previous basket from labelling the wrong lines, without clearing state
 * inside the effect.
 */
export function useCartStock(enabled = true) {
  const { lines, ready } = useCart();
  const basketKey = lines.map((l) => `${l.variantId}:${l.qty}`).join("|");

  const [fetched, setFetched] = useState<{ key: string; quote: Quote } | null>(null);
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!enabled || !ready || basketKey === "") return;
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/v1/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: lines.map((l) => ({
              productSlug: l.productSlug,
              variantId: l.variantId,
              qty: l.qty,
            })),
          }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Quote };
        if (!ignore) setFetched({ key: basketKey, quote: body.data });
      } catch {
        /* No stock answer means every line reads as available, which is
           what the cart showed before this existed. Checkout re-checks. */
      }
    })();

    return () => {
      ignore = true;
    };
    // `lines` is represented by `basketKey`; refetching on identity alone
    // would re-price the basket on every unrelated store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, basketKey]);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    fetchOpenAlertVariantIds().then((ids) => {
      if (!ignore) setRequested(new Set(ids));
    });
    return () => {
      ignore = true;
    };
  }, [enabled]);

  const quote = fetched?.key === basketKey ? fetched.quote : null;

  return useMemo(() => {
    const stockOf = (line: CartLine): LineStock => lineStock(quote, line);
    const blockedCount = lines.filter((l) => stockOf(l).state !== "available").length;

    async function requestAlert(line: CartLine): Promise<StockAlertOutcome> {
      const outcome = await postStockAlert(line.productSlug, line.variantId);
      if (outcome.kind === "saved") {
        setRequested((prev) => new Set(prev).add(line.variantId));
      }
      return outcome;
    }

    return {
      stockOf,
      blockedCount,
      sellableSubtotalPaise: sellableSubtotal(lines, quote),
      isRequested: (variantId: string) => requested.has(variantId),
      requestAlert,
    };
  }, [lines, quote, requested]);
}
