import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { availableQty, returnStock } from "@/lib/data/inventory";

type Ctx = { params: Promise<{ itemId: string }> };

const ReturnBody = z.object({
  qty: z
    .number()
    .int("Enter a whole number")
    .positive("Enter a quantity greater than zero")
    .max(1_000_000, "That looks like a typo"),
  /* The human-quotable code (`Order.reference`), not the internal id —
     a warehouse worker has the packing slip, not a cuid. Resolved to the
     id `returnStock` actually stores below. */
  orderReference: z
    .string()
    .trim()
    .min(1, "Enter the order this came back against")
    .max(40, "That doesn't look like an order reference"),
});

/**
 * POST /api/v1/admin/inventory/{itemId}/return
 *
 * A customer return. Kept distinct from an adjustment because a return
 * is explained by the order it came back against — see the comment on
 * `returnStock` — so this route requires one and resolves it before
 * calling the engine.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { itemId } = await params;
  const input = await parseBody(request, ReturnBody);

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { variantId: true, storeId: true },
  });
  if (!item) throw new ApiError("not_found", "No such inventory item");

  const order = await db.order.findUnique({
    where: { reference: input.orderReference.toUpperCase() },
    select: { id: true },
  });
  if (!order) {
    throw new ApiError("bad_request", "No order with that reference", {
      orderReference: "No order with that reference",
    });
  }

  await returnStock({
    variantId: item.variantId,
    storeId: item.storeId,
    qty: input.qty,
    orderId: order.id,
  });

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
