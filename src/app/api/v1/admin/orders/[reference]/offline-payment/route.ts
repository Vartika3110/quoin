import { z } from "zod";
import {
  IllegalOrderTransitionError,
  InvalidOfflinePaymentError,
  OFFLINE_PAYMENT_METHODS,
  OfflinePaymentNotEligibleError,
  OfflinePaymentOrderNotFoundError,
  OrderStatusRaceError,
  recordOfflinePayment,
} from "@/lib/data/orders";
import { getAdminOrder } from "@/lib/data/admin-orders";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";

type Ctx = { params: Promise<{ reference: string }> };

const Body = z.object({
  method: z.enum(OFFLINE_PAYMENT_METHODS),
  amountPaise: z.number().int().positive(),
  /** UPI transaction id, bank reference or receipt number — free text,
      bounded the same way every other staff free-text field in this app
      is (see the `note` comment on the generic status route). */
  offlineReference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/v1/admin/orders/{reference}/offline-payment
 *
 * "Mark payment received" — the staff action for money the owner took by
 * phone while Razorpay is switched off. Thin on purpose: every actual rule
 * (order must be `PENDING_PAYMENT`, amount must equal the total, both
 * status writes and their audit rows) lives in `recordOfflinePayment`
 * (`src/lib/data/orders.ts`), which is the module trusted with money —
 * this route only authenticates the caller, validates the body's shape,
 * and translates that function's typed errors into the API envelope,
 * exactly as the generic status route does for `transitionOrderStatus`.
 *
 * `amountPaise` is still taken from the body rather than looked up here
 * and substituted — not because the client is trusted to state it, but
 * because `recordOfflinePayment` itself re-checks it against
 * `order.totalPaise` and refuses any mismatch; the field exists so the
 * UI's "I have received {total} in full" checkbox has something concrete
 * to send, matching the pattern `/checkout/order` uses for a body that
 * states a total the server then verifies rather than trusts.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { reference } = await params;
  const { method, amountPaise, offlineReference, note } = await parseBody(request, Body);

  try {
    await recordOfflinePayment({
      reference,
      method,
      amountPaise,
      offlineReference,
      note,
      actorUserId: staff.id,
    });
  } catch (error) {
    if (error instanceof OfflinePaymentOrderNotFoundError) {
      throw new ApiError("not_found", "No such order");
    }
    if (
      error instanceof OfflinePaymentNotEligibleError ||
      error instanceof InvalidOfflinePaymentError ||
      error instanceof IllegalOrderTransitionError ||
      error instanceof OrderStatusRaceError
    ) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }

  /* Re-read through the same admin projection the order detail page
     itself renders from, rather than shaping a response by hand here —
     one less place that can drift from what `AdminOrderDetail` actually
     looks like. Cannot miss: `recordOfflinePayment` just committed this
     exact order inside the same request. */
  const order = await getAdminOrder(reference);
  if (!order) throw new Error("Order vanished immediately after its own offline payment");

  return ok({ order });
});
