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
  /* Optional: a client that cannot tell whether its own request landed
     (a timeout, a double-tapped button) sends the same key on a retry and
     gets the order already written for it back, rather than a second
     order and a second Razorpay order. Bounded well past any real UUID or
     nonce a client would generate. */
  idempotencyKey: z.string().min(1).max(128).optional(),
  /**
   * What the customer picked on the payment step. Client-stated rather
   * than inferred from `isRazorpayConfigured()`: `CheckoutFlow` offers
   * "Confirm with an expert" even when online payment is also available,
   * so the server cannot tell the two apart from its own configuration
   * alone, and must not guess.
   */
  paymentMode: z.enum(["online", "callback"]),
});

/**
 * POST /api/v1/checkout/order
 *
 * Turns a basket into an order — and, for online payment, a Razorpay
 * order to pay it with.
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
 * The order is always written, regardless of `paymentMode`. It used to be
 * that an unconfigured deploy 409'd here rather than write a
 * PENDING_PAYMENT row nothing could ever pay — reasonable when the only
 * screen behind this route promised online payment. It no longer is: the
 * checkout's callback screen tells the customer "an expert calls back
 * within the hour", and that promise needs an order to be the thing the
 * expert calls about. Writing nothing while telling the customer
 * otherwise is the defect this route now exists to not have.
 *
 * `paymentMode` decides what happens *after* the order is written:
 *
 *   - `"callback"` — nothing further. The order sits PENDING_PAYMENT with
 *     no `Payment` row, which is exactly and honestly "awaiting a human
 *     to take payment".
 *   - `"online"` — two more writes, in this order and not the other: the
 *     gateway order, and a payment row recording the handoff. If the
 *     gateway call fails the customer sees an error and no money has
 *     moved, while the order survives as the record that they tried. The
 *     reverse order would mean a live gateway order with nothing on this
 *     side to settle it against — a payment that cannot be attributed.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const { addressId, lines, idempotencyKey, paymentMode } = await parseBody(
    request,
    Body,
  );

  /* Only "online" needs a gateway to actually hand the customer to. A
     client only ever offers that tile when `isRazorpayConfigured()` is
     true (see `paymentMethods` in `CheckoutFlow`), so reaching here with
     it false means a stale tab or a tampered request, not the ordinary
     unconfigured deploy — that case is `paymentMode: "callback"`, and it
     is not rejected. */
  if (paymentMode === "online" && !isRazorpayConfigured()) {
    throw new ApiError(
      "conflict",
      "Online payment is not available yet. Choose 'Confirm with an expert' instead.",
    );
  }

  let order;
  try {
    order = await createPendingOrder({
      userId: user.id,
      isPro: user.tier === "PRO",
      lines,
      addressId,
      /* The account's own details. A different recipient is a field the
         checkout does not collect yet, and inventing one here would be
         inventing a customer-facing feature in an API.

         Falls back to the phone rather than to "". Accounts are created by
         verifying a number and nothing ever forces a name, so `user.name`
         is null for anyone who has not filled in their profile — which is
         most people — and `?? ""` put a delivery label with no name on it
         onto a real order. A number is something a driver can actually
         act on; an empty string is not. `.trim()` because a name of pure
         whitespace is the same problem wearing a disguise. */
      shipName: user.name?.trim() || user.phone,
      shipPhone: user.phone,
      idempotencyKey,
      paymentMode,
    });
  } catch (error) {
    if (error instanceof OrderNotPossibleError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }

  if (paymentMode === "callback") {
    return ok({
      reference: order.reference,
      subtotalPaise: order.subtotalPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      quote: order.quote,
      /* Explicit, so the client branches on this rather than on
         `razorpay` being null for some other reason. */
      paymentMode: "callback" as const,
      razorpay: null,
    });
  }

  /* A repeat of `idempotencyKey` that already reached the gateway once —
     the ordinary double-click. Nothing is created a second time: the same
     order and the same gateway order are handed back, exactly as if this
     were the first response. */
  if (order.idempotent && order.existingPayment) {
    return ok({
      reference: order.reference,
      subtotalPaise: order.subtotalPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      quote: order.quote,
      paymentMode: "online" as const,
      razorpay: {
        orderId: order.existingPayment.providerOrderId,
        keyId: razorpayKeyId(),
        amountPaise: order.existingPayment.amountPaise,
        currency: "INR",
      },
    });
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
    paymentMode: "online" as const,
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
