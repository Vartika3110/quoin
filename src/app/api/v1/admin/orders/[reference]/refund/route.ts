import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import {
  NothingToRefundError,
  OrderNotFoundError,
  OrderNotRefundableError,
  OrderNotPossibleError,
  RefundExceedsCaptureError,
  refundOrder,
} from "@/lib/data/orders";
import { RazorpayError } from "@/lib/payments/razorpay";

type Ctx = { params: Promise<{ reference: string }> };

const Body = z.object({
  /** Omit to refund whatever is still outstanding on the payment. */
  amountPaise: z.number().int().positive().max(100_000_000).optional(),
  reason: z.string().trim().max(400).optional(),
});

/**
 * POST /api/v1/admin/orders/{reference}/refund
 *
 * Gives a customer their money back, and is the only way to do so.
 *
 * This endpoint exists because the alternative was being used instead:
 * staff cancelled paid orders. The status route allowed PAID → CANCELLED
 * and nothing anywhere called Razorpay's refund API, so an order that had
 * taken ₹5,200 could be closed in two clicks with the money still in
 * Quoin's account and nothing in the system recording that the customer
 * was owed it. That edge is now gone from the transition table and
 * guarded in `transitionOrderStatus`; this is where that path leads
 * instead.
 *
 * Staff-only, like every other route under `/admin`, and 404-shaped to
 * anyone who is not — see `requireStaff`.
 *
 * The response reports the *refund's* status as well as the order's,
 * because they legitimately differ: a netbanking refund comes back
 * `pending` from Razorpay and takes days to settle, so the honest answer
 * is an order at REFUND_PENDING with a PENDING refund against it rather
 * than a REFUNDED order that has not refunded anything yet. The webhook
 * finishes it when `refund.processed` arrives.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  await requireStaff();
  const { reference } = await params;
  const { amountPaise, reason } = await parseBody(request, Body);

  try {
    const result = await refundOrder({ reference, amountPaise, reason });
    return ok(result);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      throw new ApiError("not_found", "No such order");
    }
    if (error instanceof NothingToRefundError) {
      throw new ApiError(
        "conflict",
        "There is no captured payment on this order to refund.",
      );
    }
    if (error instanceof OrderNotRefundableError) {
      throw new ApiError("conflict", error.message);
    }
    if (error instanceof RefundExceedsCaptureError) {
      throw new ApiError("conflict", error.message);
    }
    if (error instanceof OrderNotPossibleError) {
      throw new ApiError("bad_request", error.message);
    }
    if (error instanceof RazorpayError) {
      /* The gateway's own wording is written for integrators and can
         quote the request back, so it is logged by `refundOrder` and not
         returned. The refund row is left PENDING deliberately — see the
         note there on why a failed call is not marked FAILED — so the
         message has to tell staff not to simply press it again. */
      throw new ApiError(
        "internal",
        "The refund could not be confirmed with the payment gateway. It may still have gone through — check the Razorpay dashboard for this payment before trying again.",
      );
    }
    throw error;
  }
});
