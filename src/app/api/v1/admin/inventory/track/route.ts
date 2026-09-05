import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { receiveStock } from "@/lib/data/inventory";

const TrackBody = z.object({
  variantId: z.string().trim().min(1).max(64),
  storeId: z.string().trim().min(1).max(64),
  openingQty: z
    .number()
    .int("Enter a whole number")
    .positive("Enter an opening quantity greater than zero")
    .max(1_000_000, "That looks like a typo"),
});

/**
 * POST /api/v1/admin/inventory/track
 *
 * Turns stock tracking on for one variant at one store: creates the
 * `InventoryItem` row with an opening count, written as a `RECEIPT`
 * movement by `receiveStock` so the history starts truthfully rather
 * than with a number that appeared from nowhere, then flips
 * `Product.stockTracked`.
 *
 * `receiveStock` runs before the flag flip, not after: flipping the flag
 * first would make every *other* store selling this variant look
 * out-of-stock the moment a checkout reads it — `isStockBearing` plus
 * `stockTracked` is what gates `reserveStockForOrder`, and it would find
 * no `InventoryItem` row at those stores and refuse the line — for
 * however long this request takes to reach the second write. Doing the
 * receipt first means the only window between the two writes is "this
 * store isn't tracked yet", which is the state it was already in.
 *
 * Refuses to touch a variant/store pair that already has an
 * `InventoryItem` row, matching the existing-price guard on
 * `POST /api/v1/admin/products/{sku}/price`: this endpoint starts a
 * count, and a caller who wants to add to one that already exists should
 * be using `.../receive` or `.../adjust` instead — retrying this one
 * would double-count the opening quantity, since `receiveStock` adds to
 * whatever is already there rather than replacing it.
 */
export const POST = handler(async (request) => {
  await requireStaff();
  const input = await parseBody(request, TrackBody);

  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true, productId: true },
  });
  if (!variant) throw new ApiError("not_found", "No such variant");

  const store = await db.store.findUnique({
    where: { id: input.storeId },
    select: { id: true },
  });
  if (!store) throw new ApiError("not_found", "No such store");

  const existing = await db.inventoryItem.findUnique({
    where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(
      "conflict",
      "This variant is already tracked at this store — use its adjustment screen instead",
    );
  }

  await receiveStock({
    variantId: input.variantId,
    storeId: input.storeId,
    qty: input.openingQty,
  });

  await db.product.update({
    where: { id: variant.productId },
    data: { stockTracked: true },
  });

  const item = await db.inventoryItem.findUniqueOrThrow({
    where: { variantId_storeId: { variantId: input.variantId, storeId: input.storeId } },
    select: { id: true },
  });

  return ok({ itemId: item.id });
});
