import type { Quote } from "@/lib/data/checkout";
import type { CartLine } from "@/lib/store/cart";
import type { Paise } from "@/lib/types/catalog";

/**
 * Whether one cart line can still be bought, as the server last reported.
 *
 * The cart is a browser snapshot taken when each item was added, so a line
 * added two days ago knows nothing about stock that has run out since.
 * `/api/v1/checkout/quote` does, and this reads its answer line by line.
 *
 * - `out_of_stock`: a stock-tracked product with nothing left to sell. It
 *   can come back, which is why only this state offers "Notify me".
 * - `short`: some left, but fewer than the line asks for. The fix is a
 *   smaller quantity, not a notification.
 * - `unavailable`: the product or variant is gone from the catalogue. It
 *   is not coming back as this line, so there is nothing to wait for.
 * - `available`: everything else, including every untracked product —
 *   those stay sellable with no stock maths at all.
 *
 * Until a quote arrives every line reads `available`. A cart that flashes
 * "out of stock" over items that are fine, while a request is in flight,
 * is worse than one that shows the problem a moment late.
 */
export type LineStock =
  | { state: "available" }
  | { state: "short"; available: number }
  | { state: "out_of_stock" }
  | { state: "unavailable" };

const AVAILABLE: LineStock = { state: "available" };

export function lineStock(
  quote: Quote | null,
  line: { variantId: string; snapshot: { minQty: number } },
): LineStock {
  if (!quote) return AVAILABLE;
  if (quote.unavailable.some((u) => u.variantId === line.variantId)) {
    return { state: "unavailable" };
  }

  const priced = quote.lines.find((l) => l.variantId === line.variantId);
  if (!priced?.issues.includes("out_of_stock")) return AVAILABLE;

  /* Fewer left than the smallest quantity it is sold in is, to a
     customer, none left — there is no smaller order to offer them. */
  const available = priced.availableQty ?? 0;
  return available >= line.snapshot.minQty
    ? { state: "short", available }
    : { state: "out_of_stock" };
}

/**
 * The subtotal of only the lines that can be bought as they stand.
 *
 * Priced from each line's own snapshot, like the rest of the cart page,
 * so the two totals a customer sees agree until checkout re-prices both.
 * Blocked lines are left out rather than counted — a total that includes
 * something Quoin cannot sell is a total that changes at payment.
 */
export function sellableSubtotal(
  lines: Pick<CartLine, "variantId" | "qty" | "snapshot">[],
  quote: Quote | null,
): Paise {
  return lines.reduce(
    (sum, line) =>
      lineStock(quote, line).state === "available"
        ? sum + line.snapshot.pricePaise * line.qty
        : sum,
    0,
  );
}
