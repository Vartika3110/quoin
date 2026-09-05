import type { CartLine } from "@/lib/store/cart";

/**
 * One string per distinct basket-and-address combination.
 *
 * This is what lets a single checkout attempt reuse the same idempotency
 * key across a retry — a double-clicked Pay, a request that timed out —
 * while still minting a fresh one the moment there is a genuinely new
 * attempt to make: a different delivery address, or a cart whose lines or
 * quantities changed. `qty` is folded in and not just `variantId`, because
 * changing how many of something is being bought is changing what is
 * being bought, and must not silently reuse an order written for the old
 * quantity.
 *
 * Sorted before joining so two requests describing the same basket with
 * its lines in a different order — nothing about cart state guarantees
 * line order is stable — still resolve to the same key rather than
 * spuriously minting a new one.
 */
export function basketKey(
  addressId: string,
  lines: Pick<CartLine, "variantId" | "qty">[],
): string {
  return `${addressId}::${lines
    .map((l) => `${l.variantId}:${l.qty}`)
    .sort()
    .join(",")}`;
}
