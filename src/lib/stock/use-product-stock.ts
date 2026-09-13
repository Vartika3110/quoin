"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchOpenAlertVariantIds,
  postStockAlert,
  type StockAlertOutcome,
} from "@/lib/stock/request-alert";
import type { ProductStock } from "@/lib/data/product-stock";

const AVAILABLE: ProductStock = { state: "available" };

/** The most a single request asks about — the route's own cap. */
const MAX_SLUGS = 200;

/**
 * Live stock for a list of saved products, by slug.
 *
 * The list-level counterpart of `useCartStock`: saved products carry no
 * variant, so this asks `/api/v1/stock/products` for a product-level
 * answer instead of pricing lines. Until the answer arrives every product
 * reads as available, so nothing flashes "out of stock" while it loads.
 */
export function useProductStock(slugs: string[]) {
  const key = slugs.slice(0, MAX_SLUGS).join("|");

  const [fetched, setFetched] = useState<{
    key: string;
    stock: Record<string, ProductStock>;
  } | null>(null);
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (key === "") return;
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/v1/stock/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slugs: key.split("|") }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: { stock: Record<string, ProductStock> } };
        if (!ignore) setFetched({ key, stock: body.data.stock });
      } catch {
        /* No answer leaves every card as it was before this existed. */
      }
    })();

    return () => {
      ignore = true;
    };
  }, [key]);

  useEffect(() => {
    let ignore = false;
    fetchOpenAlertVariantIds().then((ids) => {
      if (!ignore) setRequested(new Set(ids));
    });
    return () => {
      ignore = true;
    };
  }, []);

  const stock = fetched?.key === key ? fetched.stock : null;

  return useMemo(() => {
    const stockOf = (slug: string): ProductStock => stock?.[slug] ?? AVAILABLE;

    async function requestAlert(slug: string): Promise<StockAlertOutcome> {
      const current = stockOf(slug);
      if (current.state !== "out_of_stock") {
        return { kind: "error", message: "This product is available again." };
      }
      const outcome = await postStockAlert(slug, current.variantId);
      if (outcome.kind === "saved") {
        setRequested((prev) => new Set(prev).add(current.variantId));
      }
      return outcome;
    }

    return {
      stockOf,
      isRequested: (slug: string) => {
        const current = stockOf(slug);
        return current.state === "out_of_stock" && requested.has(current.variantId);
      },
      requestAlert,
    };
  }, [stock, requested]);
}
