"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCart } from "@/lib/store/cart";
import type { Product } from "@/lib/types/catalog";

/**
 * "Buy Again" — re-adds a past order's lines to the current cart.
 *
 * Reads the order fresh from `GET /api/v1/orders/{reference}` rather than
 * being handed its lines as a prop: the order list page would otherwise
 * have to carry every line's `variantId` and `qty` for every order on the
 * page just in case this button is pressed, when in practice it almost
 * never is. Loads once per press instead.
 *
 * Each distinct product is then read from `GET /api/v1/products/{slug}` —
 * the same route the product page itself calls — because `useCart().add`
 * takes a full `Product` and `Variant`, not just their ids, and a
 * snapshot taken when the order was *placed* is exactly the stale price
 * `quoteCart` exists to re-check at checkout. A retired product or a
 * variant that no longer exists on it is skipped, not an error: the
 * point of this button is "get me as much of this order back as still
 * exists", not "fail the whole thing because one SKU changed".
 */
export function BuyAgainButton({ reference }: { reference: string }) {
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const [loading, setLoading] = useState(false);

  async function buyAgain() {
    setLoading(true);
    try {
      const orderRes = await fetch(`/api/v1/orders/${encodeURIComponent(reference)}`);
      const orderBody = await orderRes.json();
      if (!orderRes.ok) {
        toast.error(orderBody?.error?.message ?? "Could not load this order");
        return;
      }

      const lines: { productSlug: string; variantId: string; qty: number }[] =
        orderBody.data.order.lines;

      /* Undefined (not fetched), not null (fetched and missing) — a slug
         seen twice in one order must not cost a second request. */
      const products = new Map<string, Product | null>();
      let added = 0;
      let unavailable = 0;

      for (const line of lines) {
        let product = products.get(line.productSlug);
        if (product === undefined) {
          const res = await fetch(`/api/v1/products/${encodeURIComponent(line.productSlug)}`);
          const body = await res.json();
          product = res.ok ? (body.data.product as Product) : null;
          products.set(line.productSlug, product);
        }

        const variant = product?.variants.find((v) => v.id === line.variantId);
        if (!product || !variant) {
          unavailable++;
          continue;
        }

        cart.add(product, variant, line.qty);
        added++;
      }

      if (added === 0) {
        toast.error("None of these items are available any more");
        return;
      }

      toast.success(
        unavailable > 0
          ? `${added} item${added === 1 ? "" : "s"} added · ${unavailable} no longer available`
          : `${added} item${added === 1 ? "" : "s"} added to your cart`,
        { label: "View cart", onClick: () => router.push("/cart") },
      );
    } catch {
      toast.error("Network error — nothing was added");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={buyAgain} loading={loading} disabled={loading}>
      Buy Again
    </Button>
  );
}
