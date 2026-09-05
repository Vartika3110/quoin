import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { db } from "@/lib/db";
import { verifyCheckoutSignature } from "@/lib/payments/razorpay";

const Body = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
});

/**
 * POST /api/v1/checkout/verify
 *
 * Checks the handoff Razorpay's modal hands the browser the instant it
 * closes on success, so the confirmation screen can say something more
 * confident than a bare "processing" — without waiting on the webhook.
 *
 * This is **not** how an order becomes PAID, and it must never be made to
 * do that. `verifyCheckoutSignature` proves the customer's own browser saw
 * a genuine Razorpay response; it says nothing about whether the bank
 * actually captured the payment, and it arrives over a channel the
 * customer's browser fully controls — a forged or replayed body is
 * indistinguishable from a real one except by the HMAC, and the HMAC only
 * proves "Razorpay said this", not "money moved". Only `payment.captured`
 * delivered to `POST /api/v1/webhooks/razorpay` moves an order to PAID.
 * This route only ever reads that status back; it has no code path that
 * writes it. See the doc comments on `verifyCheckoutSignature` and on the
 * webhook handler for the reasoning in full.
 *
 * Scoped to the signed-in user even though the signature already proves
 * the handoff is genuine: `providerOrderId` is not a secret — it is hand
 * -ed to the browser precisely so it can open the checkout — so a valid
 * signature for someone else's order is still not this caller's order to
 * read the status of.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } =
    await parseBody(request, Body);

  const validSignature = verifyCheckoutSignature({
    razorpayOrderId,
    razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!validSignature) {
    /* Deliberately says nothing about which order this was for, or why —
       a caller who cannot prove the handoff does not get an order's
       existence confirmed to them either. */
    throw new ApiError(
      "bad_request",
      "This payment could not be verified. If you were charged, contact support with your order reference.",
    );
  }

  const payment = await db.payment.findUnique({
    where: { providerOrderId: razorpayOrderId },
    select: {
      order: { select: { userId: true, reference: true, status: true } },
    },
  });

  /* A genuine signature naming a gateway order that either matches nothing
     here or belongs to someone else — same 404 shape `requireStaff` uses,
     and for the same reason: nothing about the order is disclosed to a
     caller who cannot be shown to own it. */
  if (!payment || payment.order.userId !== user.id) {
    throw new ApiError("not_found", "That order could not be found.");
  }

  return ok({
    reference: payment.order.reference,
    status: payment.order.status,
  });
});
