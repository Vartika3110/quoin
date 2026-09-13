import type { Fulfilment } from "@prisma/client";
import { db } from "@/lib/db";
import { availableQty, isStockBearing } from "@/lib/data/inventory";

/**
 * Whether a saved product can still be bought, by slug.
 *
 * Saved products are kept per product, not per variant — the heart saves
 * the product — so this answers at product level, where the cart's quote
 * answers per line. A product only reads as out of stock when none of its
 * active variants has enough left for its smallest order; one buyable
 * variant keeps the whole product available, because the customer can
 * still choose it on the product page.
 *
 * The same rules as `quoteCart`: an untracked product never runs out, and
 * a tracked variant with no inventory row has nothing to sell.
 */

export type ProductStock =
  | { state: "available" }
  /** `variantId` is the one a "Notify me" request is filed against — the
      default variant, which for all but a few products is the only one. */
  | { state: "out_of_stock"; variantId: string }
  | { state: "unavailable" };

export interface ProductStockRow {
  isActive: boolean;
  stockTracked: boolean;
  fulfilment: Fulfilment;
  /** Active variants only, default first. */
  variants: { id: string; minQty: number }[];
}

/** Pure, so the rule is testable without a database. */
export function productStockState(
  product: ProductStockRow | undefined,
  availableByVariant: ReadonlyMap<string, number>,
): ProductStock {
  if (!product || !product.isActive || product.variants.length === 0) {
    return { state: "unavailable" };
  }
  if (!product.stockTracked || !isStockBearing(product.fulfilment)) {
    return { state: "available" };
  }

  const anyBuyable = product.variants.some(
    (v) => (availableByVariant.get(v.id) ?? 0) >= v.minQty,
  );
  return anyBuyable
    ? { state: "available" }
    : { state: "out_of_stock", variantId: product.variants[0].id };
}

export async function getProductStock(
  slugs: string[],
): Promise<Record<string, ProductStock>> {
  if (slugs.length === 0) return {};

  const products = await db.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      isActive: true,
      stockTracked: true,
      fulfilment: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, minQty: true },
      },
    },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  /* One grouped query for every tracked variant on the list, rather than
     one per product — a wishlist of forty is one round trip, not forty. */
  const trackedVariantIds = products
    .filter((p) => p.stockTracked && isStockBearing(p.fulfilment))
    .flatMap((p) => p.variants.map((v) => v.id));

  const availableByVariant = new Map<string, number>();
  if (trackedVariantIds.length > 0) {
    const totals = await db.inventoryItem.groupBy({
      by: ["variantId"],
      where: { variantId: { in: trackedVariantIds } },
      _sum: { onHandQty: true, reservedQty: true },
    });
    for (const row of totals) {
      availableByVariant.set(
        row.variantId,
        availableQty(row._sum.onHandQty ?? 0, row._sum.reservedQty ?? 0),
      );
    }
  }

  return Object.fromEntries(
    slugs.map((slug) => [slug, productStockState(bySlug.get(slug), availableByVariant)]),
  );
}
