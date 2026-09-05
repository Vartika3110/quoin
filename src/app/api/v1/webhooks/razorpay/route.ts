import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
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
 *
 * Every delivery — including a rejected signature and an unhandled event
 * type — is also written to `PaymentWebhook` by `recordDelivery` below, so
 * a disputed payment can be reconstructed from something other than
 * platform logs. That write is deliberately last and deliberately
 * fire-and-forget with its errors swallowed: this route's job is to tell
 * Razorpay whether the *payment* was applied, and an audit-table outage
 * must never turn a delivery that would otherwise have succeeded into a
 * 500 that gets retried for hours.
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

/**
 * Ceiling on the payload kept per delivery.
 *
 * A genuine Razorpay payment event is a couple of kilobytes; anything past
 * this is not evidence, it is a way to fill a table. Truncated rather than
 * dropped, because the head of an oversized body is still the part that
 * says what the event was.
 */
const MAX_RAW_BODY_CHARS = 16_384;

/**
 * What is kept about a body that failed signature verification.
 *
 * Deliberately not the body itself. That row is written *because* the
 * caller could not prove who they were, so its content is attacker-chosen
 * and unauthenticated — retaining it turns a public URL into unbounded
 * database growth for anyone who can guess the path. A length and a digest
 * still answer the only questions worth asking of a rejected delivery:
 * how big was it, and were these many rejections all the same payload?
 */
function fingerprint(rawBody: string): string {
  const digest = createHash("sha256").update(rawBody).digest("hex").slice(0, 16);
  return `unverified body not retained (${rawBody.length} bytes, sha256:${digest})`;
}

/**
 * Best-effort read of the event name for a delivery that failed signature
 * verification or JSON parsing. Never throws: a webhook that cannot even
 * be named is still worth a row in the audit table, with `event: null`
 * rather than a guess.
 */
function readEventNameUnverified(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as WebhookPayload;
    return typeof parsed.event === "string" ? parsed.event : null;
  } catch {
    return null;
  }
}

/**
 * Writes one row to `PaymentWebhook`. Called from every exit path in this
 * handler, including the ones that reject or ignore the delivery, because
 * those are exactly the deliveries a dispute is most likely to hinge on.
 *
 * Swallows everything. A write here running after the response has
 * already been decided must never change what was already decided —
 * see the module comment. `eventId` colliding is not an error at all: it
 * means Razorpay redelivered an event this table has already recorded,
 * and the second row would only duplicate the first.
 *
 * `rawBody` is stored because the entity ids alone do not always carry
 * enough to reconstruct a dispute — but Razorpay puts the payer's email
 * and contact on the payment entity, so this column is customer PII.
 * Nothing outside this function selects it, and no route reads or
 * exposes `PaymentWebhook` rows.
 */
async function recordDelivery(input: {
  /** Null for a delivery whose signature did not verify — see `fingerprint`. */
  rawBody: string | null;
  eventId: string | null;
  event: string | null;
  signatureValid: boolean;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  outcome: string;
  error?: string;
  /** Set once the switch below has actually finished acting on it. */
  processed: boolean;
}) {
  try {
    /* Not a foreign key — see the model comment — but a best-effort join
       back to the order it was about, for the ops view this table exists
       to support. A miss here (unknown gateway order, or the payment
       lookup itself failing) leaves it null rather than blocking the row. */
    let orderId: string | null = null;
    if (input.providerOrderId) {
      const payment = await db.payment.findUnique({
        where: { providerOrderId: input.providerOrderId },
        select: { orderId: true },
      });
      orderId = payment?.orderId ?? null;
    }

    await db.paymentWebhook.create({
      data: {
        eventId: input.eventId,
        event: input.event ?? "unknown",
        signatureValid: input.signatureValid,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        orderId,
        outcome: input.outcome,
        error: input.error,
        rawBody: input.rawBody?.slice(0, MAX_RAW_BODY_CHARS) ?? null,
        processedAt: input.processed ? new Date() : null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return; // Already recorded this exact delivery — see the note above.
    }
    console.error("[payments] failed to record a webhook delivery", error);
  }
}

export async function POST(request: Request) {
  /* Bytes first. Everything below parses this string; nothing re-reads
     the request, because the body can only be consumed once. */
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  /* Razorpay's own idempotency key for a delivery — present on genuine
     deliveries whether or not the signature checks out, so it is read
     here rather than after the check below. */
  const eventId = request.headers.get("x-razorpay-event-id");

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
    await recordDelivery({
      rawBody: null,
      /* Not the header's value. `eventId` is unique, and this path is
         reachable without a signature — so honouring an unverified id
         would let anyone pre-insert the id of an event Razorpay has not
         sent yet, and the genuine delivery's audit row would then be
         skipped as a duplicate. An unauthenticated caller does not get to
         choose a primary key. */
      eventId: null,
      event: readEventNameUnverified(rawBody),
      signatureValid: false,
      providerOrderId: null,
      providerPaymentId: null,
      outcome: "rejected_signature",
      error: fingerprint(rawBody),
      processed: false,
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    /* Signed by us and still not JSON. Retrying will not change that. */
    await recordDelivery({
      rawBody,
      eventId,
      event: null,
      signatureValid: true,
      providerOrderId: null,
      providerPaymentId: null,
      outcome: "invalid_json",
      processed: false,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const entity = body.payload?.payment?.entity;
  /* Not widened with `?? null` here — TypeScript's narrowing on the guard
     below relies on these being a direct alias of the optional chain, and
     that is also what lets `entity.amount` etc. be read without a null
     check further down. Widened to `| null` only where `recordDelivery`
     needs it. */
  const providerOrderId = entity?.order_id;
  const providerPaymentId = entity?.id;

  if (!providerOrderId || !providerPaymentId) {
    console.warn("[payments] webhook had no payment entity", { event: body.event });
    await recordDelivery({
      rawBody,
      eventId,
      event: body.event ?? null,
      signatureValid: true,
      providerOrderId: providerOrderId ?? null,
      providerPaymentId: providerPaymentId ?? null,
      outcome: "no_entity",
      processed: false,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let outcome = "unhandled_event";
  try {
    switch (body.event) {
      case "payment.captured": {
        outcome = await settleCapturedPayment({
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
        outcome = await recordFailedPayment({
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
    await recordDelivery({
      rawBody,
      eventId,
      event: body.event ?? null,
      signatureValid: true,
      providerOrderId,
      providerPaymentId,
      outcome: "processing_error",
      error: error instanceof Error ? error.message : String(error),
      processed: false,
    });
    return NextResponse.json({ error: "not processed" }, { status: 500 });
  }

  await recordDelivery({
    rawBody,
    eventId,
    event: body.event ?? null,
    signatureValid: true,
    providerOrderId,
    providerPaymentId,
    outcome,
    processed: true,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
