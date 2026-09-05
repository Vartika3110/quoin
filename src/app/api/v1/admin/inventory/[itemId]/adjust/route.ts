import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { adjustStock, availableQty, canApplyAdjustment } from "@/lib/data/inventory";

type Ctx = { params: Promise<{ itemId: string }> };

const AdjustBody = z.object({
  qty: z
    .number()
    .int("Enter a whole number")
    .refine((v) => v !== 0, "Enter a nonzero amount")
    .refine((v) => Math.abs(v) <= 1_000_000, "That looks like a typo"),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(500, "Keep the reason under 500 characters"),
});

/**
 * POST /api/v1/admin/inventory/{itemId}/adjust
 *
 * A staff correction — a stock count, a breakage, an audit finding.
 * Thin wrapper around `adjustStock`: this route's whole job is resolving
 * `itemId` to the variant/store pair that function actually takes, and
 * enforcing the one rule `adjustStock` itself does not — see
 * `canApplyAdjustment`.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { itemId } = await params;
  const input = await parseBody(request, AdjustBody);

  const item = await db.inventoryItem.findUnique({
    where: { id: itemId },
    select: { variantId: true, storeId: true, onHandQty: true, reservedQty: true },
  });
  if (!item) throw new ApiError("not_found", "No such inventory item");

  if (!canApplyAdjustment(item.onHandQty, item.reservedQty, input.qty)) {
    throw new ApiError(
      "conflict",
      "That would take on-hand stock below what is already reserved by live orders",
    );
  }

  await adjustStock({
    variantId: item.variantId,
    storeId: item.storeId,
    qty: input.qty,
    reason: input.reason,
    staffUserId: staff.id,
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
