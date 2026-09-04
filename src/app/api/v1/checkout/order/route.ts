import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  OrderNotPossibleError,
  createPendingOrder,
  recordPaymentAttempt,
} from "@/lib/data/orders";
import {
  RazorpayError,
  createGatewayOrder,
  isRazorpayConfigured,
  razorpayKeyId,
} from "@/lib/payments/razorpay";

const Body = z.object({
  addressId: z.string().min(1).max(64),
  lines: z
    .array(
      z.object({
        productSlug: z.string().min(1).max(200),
        variantId: z.string().min(1).max(64),
        qty: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * POST /api/v1/checkout/order
 *
 * Turns a basket into an order and a Razorpay order to pay it with.
 *
 * Deliberately the same line shape as `/checkout/quote`, and for the same
 * reason: the client states what it wants to buy and never what it costs.
 * Everything about money — the unit prices, the Pro rate, the GST slab,
 * the total the gateway is told — is computed here from the catalogue and
 * the user's own row. A body claiming a total has that claim ignored.
 *
 * Sign-in is required, unlike the quote. Someone must be able to see what
 * a basket costs before being asked for a phone number, but an order
 * needs an owner: an invoice has to go somewhere, and a caller ringing
 * about a reference has to be provable as the person who placed it.
 *
 * Two writes, in this order and not the other:
 *
 *   1. the order, PENDING_PAYMENT, with its lines frozen
 *   2. the gateway order, and a payment row recording the handoff
 *
 * If step 2 fails the customer sees an error and no money has moved,
 * while step 1 survives as the record that they tried. The reverse order
 * would mean a live gateway order with nothing on this side to settle it
 * against — a payment that cannot be attributed.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const { addressId, lines } = await parseBody(request, Body);

  /* Checked before the order is written rather than after. An
     unconfigured deploy would otherwise leave a PENDING_PAYMENT row for
     every customer who reached this screen, none of which can ever be
     paid — and payments are expected to be unconfigured for as long as
     gateway KYC takes. */
  if (!isRazorpayConfigured()) {
    throw new ApiError(
      "conflict",
      "Online payment is not available yet. An expert will call to take payment.",
    );
  }

  let order;
  try {
    order = await createPendingOrder({
      userId: user.id,
      isPro: user.tier === "PRO",
      lines,
      addressId,
      /* The account's own details. A different name on the delivery is a
         field the checkout does not collect yet, and inventing one here
         would be inventing a customer-facing feature in an API. */
      shipName: user.name ?? "",
      shipPhone: user.phone,
    });
  } catch (error) {
    if (error instanceof OrderNotPossibleError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }

  let gateway;
  try {
    gateway = await createGatewayOrder({
      amountPaise: order.totalPaise,
      receipt: order.reference,
      /* Shown in the Razorpay dashboard. It is what makes a payment there
         findable from a reference a customer reads out on the phone. */
      notes: { quoinOrderReference: order.reference, quoinOrderId: order.id },
    });
  } catch (error) {
    if (error instanceof RazorpayError) {
      /* The gateway's own text is written for integrators and can quote
         the request back, so it is logged and not returned. */
      console.error("[payments] gateway order failed", {
        reference: order.reference,
        message: error.message,
      });
      throw new ApiError(
        "internal",
        "We could not start the payment. Please try again.",
      );
    }
    throw error;
  }

  await recordPaymentAttempt({
    orderId: order.id,
    providerOrderId: gateway.id,
    amountPaise: order.totalPaise,
  });

  return ok({
    reference: order.reference,
    subtotalPaise: order.subtotalPaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    /* Returned so the checkout can show a price change it has not seen —
       the basket is re-priced here too, and this request may be the one
       that discovers the move. */
    quote: order.quote,
    razorpay: {
      orderId: gateway.id,
      /* From the environment on every request rather than inlined at
         build time, so rotating the key — or switching from `rzp_test_`
         to `rzp_live_` on activation day — needs no redeploy. */
      keyId: razorpayKeyId(),
      amountPaise: gateway.amountPaise,
      currency: "INR",
    },
  });
});
