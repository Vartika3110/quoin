import type { Paise, Product, Variant } from "@/lib/types/catalog";

/**
 * Quantity rules.
 *
 * Pure and dependency-free so the exact same code runs in the browser for
 * the optimistic line total and on the server when the order is priced. A
 * quantity the client accepted but the server rejects is the worst class
 * of checkout bug, so there is deliberately only one implementation.
 */

/**
 * Snaps a requested quantity onto the variant's sellable grid.
 *
 * Marble is sold in 20 sq.ft. minimums stepping by 5 — a request for 23
 * becomes 25, not a rejection. Rounding up rather than down matters: a
 * customer who needs 23 sq.ft. and is silently sold 20 is short on site.
 */
export function normalizeQty(
  /* The grid, not a whole variant. The cart holds a snapshot of these two
     numbers rather than the variant they came from, and widening the
     parameter is better than casting a two-field object to `Variant` at
     the call site — a cast that claims fields the object does not have. */
  variant: Pick<Variant, "minQty" | "stepQty">,
  requested: number,
): number {
  const { minQty, stepQty } = variant;
  if (!Number.isFinite(requested) || requested <= minQty) return minQty;
  const stepsAbove = Math.ceil((requested - minQty) / stepQty);
  return minQty + stepsAbove * stepQty;
}

/** Whether the buyer picks a quantity at all. A site visit is one visit. */
export function isQuantitySelectable(product: Product): boolean {
  return product.fulfilment !== "bookable";
}

/**
 * Area-priced goods are bought by room, not by number. Buyers measure a
 * floor in feet and expect the sq.ft. to be worked out for them.
 */
export function areaFromDimensions(lengthFt: number, widthFt: number): number {
  if (!Number.isFinite(lengthFt) || !Number.isFinite(widthFt)) return 0;
  if (lengthFt <= 0 || widthFt <= 0) return 0;
  return lengthFt * widthFt;
}

/**
 * Cutting and breakage allowance for area-priced materials.
 *
 * Trade practice is to over-order stone and tile by ~10%; a buyer who
 * orders the exact measured area runs short. Offered rather than forced,
 * because a professional ordering to a BOQ has already accounted for it.
 */
export const WASTAGE_RATE = 0.1;

export function applyWastage(area: number, include: boolean): number {
  return include ? area * (1 + WASTAGE_RATE) : area;
}

/** Line total in paise. Integer maths throughout — never float rupees. */
export function lineTotal(unitPrice: Paise, qty: number): Paise {
  return Math.round(unitPrice * qty);
}
