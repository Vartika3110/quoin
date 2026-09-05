import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { IllegalOrderTransitionError } from "@/lib/data/orders";
import {
  OrderNotFoundError,
  OrderStatusRaceError,
  PaidNotAdminSettableError,
  transitionOrderStatus,
} from "@/lib/data/admin-orders";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ reference: string }> };

const Body = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  /** Free text, shown on the order's audit trail. Bounded the same way
      every other staff free-text field in this app is — a refund
      `reason`, an inventory adjustment `reason` — long enough for a real
      explanation, short enough that a note cannot become a document. */
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/v1/admin/orders/{reference}/status
 *
 * Moves an order to a new status, staff only. Every rejection here is a
 * business rule with its own message, not a generic failure:
 *
 *   - `toStatus: "PAID"` is refused outright — only the Razorpay webhook,
 *     via a signature-verified `payment.captured`, may set it. See
 *     `PaidNotAdminSettableError`.
 *   - A move `canTransition` does not allow is a 409, not a silent write.
 *   - Two staff transitioning the same order at once: the loser gets a
 *     409 telling them to reload, not a corrupted state — see
 *     `OrderStatusRaceError`.
 *
 * `requireStaff()` records nothing about *who* on its own — that is what
 * `actorUserId` below is for, written into the same transaction as the
 * status change (`OrderStatusChange`, see `transitionOrderStatus`).
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { reference } = await params;
  const { toStatus, note } = await parseBody(request, Body);

  try {
    const order = await transitionOrderStatus({
      reference,
      toStatus,
      actorUserId: staff.id,
      note,
    });
    return ok({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      throw new ApiError("not_found", "No such order");
    }
    if (error instanceof PaidNotAdminSettableError) {
      throw new ApiError("conflict", error.message);
    }
    if (error instanceof IllegalOrderTransitionError) {
      throw new ApiError("conflict", error.message);
    }
    if (error instanceof OrderStatusRaceError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }
});
