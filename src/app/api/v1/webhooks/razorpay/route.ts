import { NextResponse } from "next/server";
import { recordFailedPayment, settleCapturedPayment } from "@/lib/data/orders";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

/**
 * POST /api/v1/webhooks/razorpay
 *
 * The only authority on whether an order has been paid.
 *
 * The browser also gets a signed handoff when the checkout modal closes,
 * and that is worth verifying for a confident confirmation screen — but
 * it is not this. It travels through the customer's own browser, it is
 * absent whenever they close the tab on a successful payment, and it says
 * the gateway responded rather than that money was captured. Only
 * `payment.captured`, arriving here, moves an order to PAID.
 *
 * Three things this handler does differently from every other route in
 * `/api/v1`, each for a reason:
 *
 * **No session, and no `handler()` envelope.** The caller is Razorpay,
 * not a customer and not the app's own client. It authenticates with an
 * HMAC over the body, and it wants a bare 2xx — the `{ data: ... }`
 * envelope exists for clients that parse it, and this one does not.
 *
 * **The raw body is read before anything is parsed.** The signature is
 * over the exact bytes sent. `request.json()` and a re-serialise would
 * change key order and whitespace and fail every legitimate delivery.
 *
 * **Almost everything answers 200.** Razorpay retries any non-2xx with
 * backoff for hours. A duplicate, an unrecognised event type and a stale
 * test payment are all things retrying cannot fix, so they are
 * acknowledged. Only a genuinely unprocessed delivery — a real error
 * mid-write — is left to retry.
 */

/** Razorpay's payload for the events this route subscribes to. */
interface WebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        method?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
  };
}

export async function POST(request: Request) {
  /* Bytes first. Everything below parses this string; nothing re-reads
     the request, because the body can only be consumed once. */
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    /* 401 rather than 200. This is the one rejection worth having in the
       logs and worth Razorpay reporting as a failed delivery: it means
       either the secret is wrong — the usual cause of payments that
       succeed while orders stay PENDING_PAYMENT — or someone is posting
       to this URL who should not be.

       Deliberately says nothing about which. A handler that distinguishes
       "no secret configured" from "bad signature" tells an attacker
       which deploys are worth forging against. */
    console.warn("[payments] rejected a webhook with an invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    /* Signed by us and still not JSON. Retrying will not change that. */
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const entity = body.payload?.payment?.entity;
  const providerOrderId = entity?.order_id;
  const providerPaymentId = entity?.id;

  if (!providerOrderId || !providerPaymentId) {
    console.warn("[payments] webhook had no payment entity", { event: body.event });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    switch (body.event) {
      case "payment.captured": {
        const outcome = await settleCapturedPayment({
          providerOrderId,
          providerPaymentId,
          amountPaise: entity.amount ?? -1,
          method: entity.method,
        });

        if (outcome === "amount_mismatch") {
          /* Logged loudly and answered 200. Retrying delivers the same
             mismatched amount, so the retry is useless; what this needs
             is a person, and the discrepancy is on the payment row. */
          console.error("[payments] captured amount did not match the order", {
            providerOrderId,
            providerPaymentId,
            capturedPaise: entity.amount,
          });
        } else if (outcome === "unknown") {
          console.warn("[payments] capture for an unrecognised gateway order", {
            providerOrderId,
          });
        }
        break;
      }

      case "payment.failed": {
        await recordFailedPayment({
          providerOrderId,
          providerPaymentId,
          method: entity.method,
          reason: entity.error_description ?? entity.error_reason,
        });
        break;
      }

      default:
        /* Razorpay sends whatever the dashboard subscribes the endpoint
           to, and that list is edited by a person who is not this code.
           An unknown event is acknowledged rather than retried forever. */
        break;
    }
  } catch (error) {
    /* The one case worth a retry: the signature was good and the event
       understood, but the write did not land. 500 makes Razorpay try
       again, which is exactly what should happen. */
    console.error("[payments] failed to apply a webhook", {
      event: body.event,
      providerOrderId,
      error,
    });
    return NextResponse.json({ error: "not processed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
