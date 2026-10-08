import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ sku: string }> };

/**
 * Taking a product off the shop, and taking it out of the database.
 *
 * Two different operations, and conflating them is the mistake this file
 * exists to prevent. "We have stopped selling this" is almost always
 * what someone means, it is reversible, and it keeps the row that a
 * past order, a wishlist entry and a stock count all point at.
 * "Delete it" is none of those things.
 *
 * So `PATCH` retires and restores, and `DELETE` is the rarer, permanent
 * one — for a row that should never have existed, a duplicate or a typo'd
 * import, not for a line that has simply run its course.
 */

const Retirement = z.object({
  /** False retires the product; true puts it back on the storefront. */
  isActive: z.boolean(),
});

/**
 * PATCH /api/v1/admin/products/{sku}
 *
 * Retires or restores. The storefront reads `isActive: true` plus "has an
 * active variant" on every catalogue query, so clearing this takes the
 * product out of listings, search, rails and its own page on the next
 * request — the app is `force-dynamic` throughout with no cache to
 * invalidate.
 *
 * A retired product keeps its slug, which is the point: restoring it
 * brings back the same URL rather than minting a new one that every
 * indexed link has never heard of.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  await requireStaff();

  const { sku } = await params;
  const { isActive } = await parseBody(request, Retirement);

  const product = await db.product.findUnique({
    where: { sku },
    select: {
      id: true,
      isActive: true,
      /* Active variants only. The storefront requires one, so counting
         every variant here would report a product as back in the shop
         when its only price is switched off. */
      _count: { select: { variants: { where: { isActive: true } } } },
    },
  });
  if (!product) throw new ApiError("not_found", "No such product");

  const updated = await db.product.update({
    where: { id: product.id },
    data: { isActive },
    select: { sku: true, slug: true, isActive: true },
  });

  return ok({
    ...updated,
    /* Restoring something that never had a price does not put it in the
       shop — the storefront also requires an active variant. Said here so
       the caller can report it rather than showing a product as live that
       a customer cannot see. */
    sellable: updated.isActive && product._count.variants > 0,
  });
});

/**
 * DELETE /api/v1/admin/products/{sku}
 *
 * Permanent. Removes the product, its variants and their price tiers,
 * along with the wishlist entries and back-in-stock alerts that point at
 * those variants — all four of those relations cascade from here.
 *
 * What it does *not* touch is anything that recorded a sale or a plan.
 * `OrderLine`, `ProjectMaterial` and `StudioSpaceItem` all reference the
 * catalogue by plain string rather than by foreign key, specifically so
 * that a retired SKU cannot delete a customer's order history or a
 * designer's room. An order placed yesterday still says what was bought
 * and what it cost after this call.
 *
 * It is refused in exactly one case: counted stock. `InventoryItem` holds
 * the variant with `onDelete: Restrict`, so the database would refuse
 * anyway — this turns that into an answer someone can act on instead of a
 * constraint violation in a log.
 */
export const DELETE = handler(async (_request, { params }: Ctx) => {
  await requireStaff();

  const { sku } = await params;

  const product = await db.product.findUnique({
    where: { sku },
    select: {
      id: true,
      name: true,
      variants: { select: { _count: { select: { inventoryItems: true } } } },
    },
  });
  if (!product) throw new ApiError("not_found", "No such product");

  const stocked = product.variants.reduce((n, v) => n + v._count.inventoryItems, 0);
  if (stocked > 0) {
    throw new ApiError(
      "conflict",
      "This product has counted stock against it. Retire it instead, or zero " +
        "its inventory first — deleting it would discard a stock count and the " +
        "movement history behind it.",
    );
  }

  await db.product.delete({ where: { id: product.id } });

  return ok({ sku, name: product.name, deleted: true });
});
