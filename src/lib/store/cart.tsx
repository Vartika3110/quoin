"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  createPersistentStore,
  usePersistentStore,
} from "@/lib/store/persistent";
import { useHydrated } from "@/lib/store/hydrated";
import { normalizeQty } from "@/lib/cart/quantity";
import type {
  FulfilmentType,
  Paise,
  PricingUnit,
  Product,
  Variant,
} from "@/lib/types/catalog";

/**
 * The cart.
 *
 * Two decisions carry the whole design:
 *
 * **A line is a reference plus a display snapshot.** The reference —
 * product slug and variant id — is what the server will re-price at
 * checkout. The snapshot is what the drawer draws so that opening a cart
 * does not fire twenty product requests. The snapshot is never the source
 * of truth for money: `resolvePrice` runs again server-side, and if the
 * catalogue moved, the customer is shown the new price before paying.
 * Trusting a price a browser has been holding for a week is how a
 * storefront gets sold a ₹40,000 slab for ₹4.
 *
 * **Lines are grouped by fulfilment, not merged.** Quoin sells four things
 * that cannot travel together: an 18-minute dark-store item, a scheduled
 * warehouse delivery, a booked site visit and a made-to-order cut. One
 * combined "delivery date" across those is a guess, and the cart is
 * exactly where the guess becomes a promise. `groupLines` below is what
 * checkout, the drawer and the order summary all read.
 */

/* Bump the version when `CartLine` changes shape. A stale cart is
   discarded, not migrated — see the note in storage.ts.

   Created at module scope so every component shares one subscription and
   one parse, and so a write in another tab reaches this one. */
const EMPTY: CartLine[] = [];
const store = createPersistentStore<CartLine[]>("cart", 1, EMPTY);

/** A booked slot, for `bookable` lines. Absent on everything else. */
export interface BookingSlot {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Human label for the window, e.g. "09:00 – 11:00". */
  window: string;
}

export interface CartLine {
  /** Stable within a cart: the same variant added twice is one line. */
  id: string;
  productSlug: string;
  variantId: string;
  qty: number;
  addedAt: number;
  slot?: BookingSlot;
  /** Display only. Re-resolved server-side before any money moves. */
  snapshot: {
    title: string;
    brand: string | null;
    variantLabel: string;
    sku: string;
    photo?: string;
    image: string;
    pricePaise: Paise;
    mrpPaise: Paise | null;
    pricingUnit: PricingUnit;
    fulfilment: FulfilmentType;
    leadTimeDays?: number;
    minQty: number;
    stepQty: number;
  };
}

export interface CartGroup {
  fulfilment: FulfilmentType;
  lines: CartLine[];
  subtotalPaise: Paise;
}

interface CartApi {
  lines: CartLine[];
  /** Total pieces, not lines — the badge counts what is in the basket. */
  count: number;
  subtotalPaise: Paise;
  /** Sum of `mrp − price` across the cart. Zero when nothing is discounted. */
  savingsPaise: Paise;
  groups: CartGroup[];
  /** True until the persisted cart has been read, so the badge can wait. */
  ready: boolean;
  /**
   * The line for one variant, if it is in the cart.
   *
   * Exists so a product card can show a stepper instead of an "Add"
   * button once the thing is already in the basket — the single most
   * useful piece of state a commerce card can carry, and the reason this
   * is on the API rather than left to callers filtering `lines`.
   */
  find: (productSlug: string, variantId: string) => CartLine | undefined;
  add: (
    product: Product,
    variant: Variant,
    qty: number,
    slot?: BookingSlot,
  ) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);

function lineId(productSlug: string, variantId: string): string {
  return `${productSlug}::${variantId}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  /* The server renders the empty cart and the client swaps in the stored
     one during hydration — no effect, no second render, no mismatch. */
  const [lines, setLines] = usePersistentStore(store);
  const ready = useHydrated();

  const add = useCallback(
    (product: Product, variant: Variant, qty: number, slot?: BookingSlot) => {
      const id = lineId(product.slug, variant.id);
      setLines((current) => {
        const existing = current.find((l) => l.id === id);
        if (existing) {
          /* Adding again tops up rather than replacing. A customer who
             adds 10 bags and then 5 more wants 15, not 5. */
          return current.map((l) =>
            l.id === id
              ? { ...l, qty: normalizeQty(variant, l.qty + qty), slot: slot ?? l.slot }
              : l,
          );
        }
        return [
          ...current,
          {
            id,
            productSlug: product.slug,
            variantId: variant.id,
            qty: normalizeQty(variant, qty),
            addedAt: Date.now(),
            slot,
            snapshot: {
              title: product.title,
              brand: product.brand,
              variantLabel: variant.label,
              sku: variant.sku,
              photo: product.photo,
              image: product.image,
              pricePaise: variant.price,
              mrpPaise: variant.mrp > variant.price ? variant.mrp : null,
              pricingUnit: product.pricingUnit,
              fulfilment: product.fulfilment,
              leadTimeDays: product.leadTimeDays,
              minQty: variant.minQty,
              stepQty: variant.stepQty,
            },
          },
        ];
      });
    },
    [setLines],
  );

  const setQty = useCallback(
    (id: string, qty: number) => {
    setLines((current) =>
      current.flatMap((l) => {
        if (l.id !== id) return l;
        /* Below the minimum is a removal, not a clamp: the stepper's own
           "−" at the minimum should empty the line rather than sit there
           doing nothing. */
        if (qty < l.snapshot.minQty) return [];
        return {
          ...l,
          qty: normalizeQty(l.snapshot, qty),
        };
      }),
    );
  }, [setLines]);

  const remove = useCallback((id: string) => {
    setLines((current) => current.filter((l) => l.id !== id));
  }, [setLines]);

  const clear = useCallback(() => setLines(EMPTY), [setLines]);

  const api = useMemo<CartApi>(() => {
    const subtotalPaise = lines.reduce(
      (sum, l) => sum + l.snapshot.pricePaise * l.qty,
      0,
    );
    const savingsPaise = lines.reduce(
      (sum, l) =>
        sum +
        (l.snapshot.mrpPaise
          ? (l.snapshot.mrpPaise - l.snapshot.pricePaise) * l.qty
          : 0),
      0,
    );

    return {
      lines,
      count: lines.reduce((n, l) => n + (l.snapshot.fulfilment === "bookable" ? 1 : l.qty), 0),
      subtotalPaise,
      savingsPaise,
      groups: groupLines(lines),
      ready,
      find: (productSlug, variantId) =>
        lines.find((l) => l.id === lineId(productSlug, variantId)),
      add,
      setQty,
      remove,
      clear,
    };
  }, [lines, ready, add, setQty, remove, clear]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const api = useContext(CartContext);
  if (!api) throw new Error("useCart must be used inside <CartProvider>");
  return api;
}

/**
 * Splits a cart into the shipments it will actually become.
 *
 * Ordered so the fastest promise is first, which is also the order the
 * customer thinks in: what arrives today, what arrives this week, what is
 * being made, what is being visited.
 */
const GROUP_ORDER: FulfilmentType[] = [
  "instant",
  "scheduled",
  "made_to_order",
  "bookable",
];

export function groupLines(lines: CartLine[]): CartGroup[] {
  return GROUP_ORDER.flatMap((fulfilment) => {
    const inGroup = lines.filter((l) => l.snapshot.fulfilment === fulfilment);
    if (inGroup.length === 0) return [];
    return {
      fulfilment,
      lines: inGroup,
      subtotalPaise: inGroup.reduce(
        (sum, l) => sum + l.snapshot.pricePaise * l.qty,
        0,
      ),
    };
  });
}

/** What each group promises, spelled out for the cart and checkout. */
export const GROUP_PROMISE: Record<
  FulfilmentType,
  { title: string; detail: (leadDays?: number) => string }
> = {
  instant: {
    title: "Arriving in 18 minutes",
    detail: () => "From your nearest Quoin store.",
  },
  scheduled: {
    title: "Scheduled delivery",
    detail: (d) => `Dispatched from the regional warehouse — about ${d ?? 2} days.`,
  },
  made_to_order: {
    title: "Made to order",
    detail: (d) => `Cut to your measurements after ordering — about ${d ?? 7} days.`,
  },
  bookable: {
    title: "Booked visits",
    detail: () => "A verified expert attends at the slot you chose.",
  },
};
