import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { IllegalOrderTransitionError } from "@/lib/data/orders";
import {
  OrderNotFoundError,
  OrderStatusRaceError,
  PaidNotAdminSettableError,
  transitionOrderStatus,
} from "@/lib/data/admin-orders";
import { notifyOrderStatus } from "@/lib/data/order-notifications";
import { notifyCustomerOfStatus } from "@/lib/data/order-whatsapp";
import { cancelOutstandingFulfilments } from "@/lib/data/order-fulfilments";
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
 *   - `toStatus: "PAID"` is refused outright, on this endpoint always —
 *     it is reachable only via a signature-verified Razorpay
 *     `payment.captured` webhook, or through the dedicated
 *     `POST .../offline-payment` action for money staff took by phone.
 *     See `PaidNotAdminSettableError`.
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

    /* After the transition's own transaction has committed, never inside
       it — see the module comment on `notify`. A no-op for every status
       this function does not ring a bell for. */
    await notifyOrderStatus({
      userId: order.customer.id,
      reference: order.reference,
      status: order.status,
      /* Whether this order was ever really placed, which only the
         `CANCELLED` branch reads — see `notifyOrderStatus`. Computed from
         the payments the admin projection already carries rather than
         with another query. */
      wasPlaced: order.payments.some((payment) => payment.status === "CAPTURED"),
    });

    /* A cancelled order still has vendors who were told to pick it. Their
       outstanding legs are closed before the customer is messaged, so a
       vendor reloading their dispatch link in the same minute is refused
       rather than sending goods for an order that no longer exists. A leg
       already DISPATCHED is deliberately left alone — that store did send
       its items, and rewriting it would make the record lie. */
    if (order.status === "CANCELLED") {
      try {
        await cancelOutstandingFulfilments(order.id);
      } catch (error) {
        console.error("[orders] could not close vendor legs after a cancellation", {
          reference: order.reference,
          error,
        });
      }
    }

    /* The WhatsApp half of the same milestone, and a no-op for every
       status that is not one of the four the customer hears about —
       `messageTypeForStatus` (`src/lib/data/order-whatsapp.ts`) is the
       list, and the retired internal statuses are deliberately absent
       from it. Swallows everything of its own accord: the transition has
       already committed, and reporting a messaging failure as a failed
       status change would be a lie staff would act on. */
    await notifyCustomerOfStatus({ orderId: order.id, status: order.status });

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
