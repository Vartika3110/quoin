import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { availableQty, receiveStock } from "@/lib/data/inventory";

type Ctx = { params: Promise<{ itemId: string }> };

const ReceiveBody = z.object({
  qty: z
    .number()
    .int("Enter a whole number")
    .positive("Enter a quantity greater than zero")
    .max(1_000_000, "That looks like a typo"),
});

/**
 * POST /api/v1/admin/inventory/{itemId}/receive
 *
 * Stock arriving at a store that already tracks this variant — a
 * restock, not a first count-in (that is `POST .../track`, which creates
 * the item). Thin wrapper around `receiveStock`, same shape as `adjust`.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { itemId } = await params;
  const input = await parseBody(request, ReceiveBody);

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { variantId: true, storeId: true },
  });
  if (!item) throw new ApiError("not_found", "No such inventory item");

  await receiveStock({ variantId: item.variantId, storeId: item.storeId, qty: input.qty });

  const updated = await db.inventoryItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { onHandQty: true, reservedQty: true },
  });

  return ok({
    onHandQty: updated.onHandQty,
    reservedQty: updated.reservedQty,
    availableQty: availableQty(updated.onHandQty, updated.reservedQty),
  });
});
