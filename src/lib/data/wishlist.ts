import { db } from "@/lib/db";
import { listProductsBySlugs } from "@/lib/data/catalog";
import type { Product } from "@/lib/types/catalog";

/**
 * The wishlist, owned by an account.
 *
 * It lived in browser storage until now, which meant it did not follow a
 * customer to a second device, did not survive clearing site data, and
 * could not be read by anything server-side — a back-in-stock mail, say.
 *
 * ## Only the slug is stored
 *
 * The browser version kept a snapshot of each product — title, brand,
 * photograph, price — so the page could render without a query. That
 * snapshot went stale, and it went stale in the worst possible place: it
 * showed yesterday's price on the one page a customer opens precisely to
 * check whether the price has moved. Here the row is a slug and a date,
 * and everything shown is read fresh.
 *
 * ## A missing product is not an error
 *
 * `productSlug` is deliberately not a foreign key — see the model
 * comment. So a row can outlive the product it names, and `listWishlist`
 * simply drops it rather than rendering a gap. The row stays: the
 * catalogue is reimported wholesale and a slug that is absent today may
 * be back tomorrow, so deleting it on a miss would quietly empty
 * wishlists during an import.
 */

/** Newest first, resolved to products. Rows whose product has gone are
    omitted — see above. */
export async function listWishlist(userId: string): Promise<Product[]> {
  const rows = await db.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { productSlug: true },
  });
  if (rows.length === 0) return [];

  const slugs = rows.map((r) => r.productSlug);
  const products = await listProductsBySlugs(slugs);

  /* `listProductsBySlugs` returns in no particular order — see its own
     note — and the order that matters here is the one the customer
     built, newest first. */
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((p): p is Product => p != null);
}

/** Just the slugs, for deciding which hearts are filled. Cheaper than
    resolving products when that is all the caller needs. */
export async function listWishlistSlugs(userId: string): Promise<string[]> {
  const rows = await db.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { productSlug: true },
  });
  return rows.map((r) => r.productSlug);
}

/**
 * Heart a product. Idempotent.
 *
 * `createMany` with `skipDuplicates` rather than an upsert, so hearting
 * something already on the list is a no-op that keeps its original date
 * instead of jumping it to the top. A customer who taps a filled heart
 * twice by accident should not find their list reordered.
 */
export async function addToWishlist(
  userId: string,
  productSlugs: string[],
): Promise<void> {
  const slugs = [...new Set(productSlugs)].filter(Boolean);
  if (slugs.length === 0) return;

  await db.wishlistItem.createMany({
    data: slugs.map((productSlug) => ({ userId, productSlug })),
    skipDuplicates: true,
  });
}

/** Unheart. Silent when it was not there, which is what the caller means. */
export async function removeFromWishlist(
  userId: string,
  productSlug: string,
): Promise<void> {
  await db.wishlistItem.deleteMany({ where: { userId, productSlug } });
}

/**
 * Fold a signed-out list into the account's own.
 *
 * Somebody who hearted six things and then signed in has not changed
 * their mind about any of them, so the local list is merged rather than
 * replaced or discarded — `skipDuplicates` makes an overlap harmless.
 *
 * The merge is one-way on purpose. Pulling the account's list back into
 * the browser is the client's job after this returns, because only the
 * client knows whether it has anything left to clear.
 */
export async function mergeWishlist(
  userId: string,
  productSlugs: string[],
): Promise<void> {
  await addToWishlist(userId, productSlugs);
}
