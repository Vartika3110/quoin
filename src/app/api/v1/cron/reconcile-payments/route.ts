import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCron, refuseCron } from "@/lib/cron";
import { notifyPaymentSettled } from "@/lib/data/order-notifications";
import { onOrderPlacedForGatewayOrder } from "@/lib/data/order-whatsapp";
import { settleCapturedPayment } from "@/lib/data/orders";
import {
  RazorpayError,
  fetchGatewayPayments,
  isRazorpayConfigured,
} from "@/lib/payments/razorpay";

/**
 * GET /api/v1/cron/reconcile-payments
 *
 * Asks Razorpay directly about orders that look paid-but-aren't, and
 * settles the ones that actually were.
 *
 * **Why this exists.** The webhook is the fast path to `PAID` and it is
 * the right one, but it is a single delivery over a network this app does
 * not control, and when it stops working it stops working *silently*.
 * That is not hypothetical here: every one of the first 45 deliveries
 * this deployment ever received was rejected for a bad signature — 15 of
 * them `payment.captured` — and nothing noticed for three weeks, because
 * there was nothing whose job it was to notice. A customer's money can
 * move while the order sits `PENDING_PAYMENT` forever, stock uncommitted
 * and no confirmation sent, and the only recovery is somebody ringing up
 * and a staff member recording the payment by hand.
 *
 * So there are now two authorities on payment instead of one, and the
 * distinction worth being precise about is *which* authority was ever
 * being excluded. The rule the webhook states — only `payment.captured`
 * moves an order to `PAID` — exists to keep the **customer's browser**
 * out of the decision, because that is a channel the customer controls
 * and a signed handoff only proves "Razorpay said this", not "money
 * moved". This job is not that channel. It is this server calling
 * Razorpay's own API with the account's secret key and reading back what
 * the gateway itself holds, which nobody but Razorpay can forge. Treating
 * that as authority is not a weakening of the rule; it is the rule's
 * actual content.
 *
 * **Nothing here is a second settlement path.** Both authorities converge
 * on one function. `settleCapturedPayment` does every check it has always
 * done — the amount comparison, the conditional claim that lets exactly
 * one caller move the row, the stock commit inside the same transaction —
 * and it cannot tell whether it was called by a webhook or by this. A
 * late webhook arriving after this job has already settled gets
 * `duplicate` and changes nothing, and so does the reverse. That is the
 * whole reason this could be added without touching the settlement logic.
 *
 * **It only ever settles.** It will not mark anything `FAILED`, cancel
 * anything, or move an order the customer might still pay. An attempt
 * Razorpay reports as failed is left exactly where it is, because the
 * customer is very often still at the checkout about to try another card
 * — the same reasoning `recordFailedPayment` is written to.
 */

export const dynamic = "force-dynamic";

/* Each candidate costs one outbound Razorpay call, serially. 50 of them
   against a 10s per-call timeout needs headroom the default does not
   give. */
export const maxDuration = 60;

/**
 * How recent an order has to *not* be before this job will touch it.
 *
 * A customer sitting at the Razorpay modal has an order that is
 * `PENDING_PAYMENT` with an uncaptured payment row, which is
 * indistinguishable from a stuck one by looking at this database alone.
 * Waiting ten minutes means the ordinary in-flight checkout is never a
 * candidate, so this job never races a payment that is about to settle
 * itself through the webhook anyway.
 */
const SETTLE_GRACE_MS = 10 * 60 * 1000;

/**
 * How far back to look.
 *
 * Long enough that an order stuck through a weekend, a holiday, or three
 * weeks of a misconfigured webhook secret is still recovered — which is
 * the case that prompted this — and bounded so the scan does not grow
 * without limit as the order table does.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Candidates examined per run.
 *
 * Newest first, deliberately. A recent stuck order is a customer still
 * waiting to hear; a 29-day-old one is a bookkeeping entry. If a run ever
 * fills this batch, something is wrong at a scale a cron job is not the
 * fix for, and the next run picks up where this one stopped.
 */
const BATCH = 50;

interface Summary {
  examined: number;
  settled: number;
  /** Already settled by a webhook or an earlier run — the ordinary case. */
  alreadySettled: number;
  /** Captured for an amount that is not the order total. Needs a person. */
  mismatched: number;
  /** Authorized but never captured — see the warning below. */
  awaitingCapture: number;
  /** Razorpay could not be reached, or answered an error, for this order. */
  errors: number;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return refuseCron();

  if (!isRazorpayConfigured()) {
    /* Not an error. A deploy with payments switched off has nothing to
       reconcile, and this job running to completion with nothing to do is
       the correct outcome rather than a failure to alert on. */
    return NextResponse.json({ ok: true, skipped: "razorpay_not_configured" });
  }

  const now = Date.now();

  const candidates = await db.payment.findMany({
    where: {
      provider: "RAZORPAY",
      /* Never re-examine a row that has already settled. The conditional
         claim inside `settleCapturedPayment` would make it harmless, but
         it would also be one wasted gateway call per settled order per
         run, forever. */
      status: { not: "CAPTURED" },
      providerOrderId: { not: null },
      order: {
        status: "PENDING_PAYMENT",
        createdAt: {
          lt: new Date(now - SETTLE_GRACE_MS),
          gt: new Date(now - MAX_AGE_MS),
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: BATCH,
    select: {
      providerOrderId: true,
      order: { select: { reference: true } },
    },
  });

  const summary: Summary = {
    examined: candidates.length,
    settled: 0,
    alreadySettled: 0,
    mismatched: 0,
    awaitingCapture: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    /* Narrowed by the `not: null` filter above, which Prisma's types do
       not carry through to the selection. */
    const providerOrderId = candidate.providerOrderId;
    if (!providerOrderId) continue;

    try {
      const payments = await fetchGatewayPayments(providerOrderId);

      const captured = payments.find((p) => p.status === "captured");
      if (!captured) {
        /* `authorized` means the money is held but never taken, which is
           what an account left on *manual* capture does to every payment
           it processes. It presents exactly as a broken webhook — orders
           stuck `PENDING_PAYMENT` while customers are certain they paid —
           so it is counted and named rather than lumped in with "nothing
           to do". The fix is a Razorpay dashboard setting, not code; see
           the note on capture mode in `createGatewayOrder`. */
        if (payments.some((p) => p.status === "authorized")) {
          summary.awaitingCapture++;
          console.warn("[payments] gateway payment authorized but never captured", {
            reference: candidate.order.reference,
            providerOrderId,
          });
        }
        continue;
      }

      const outcome = await settleCapturedPayment({
        providerOrderId,
        providerPaymentId: captured.id,
        amountPaise: captured.amountPaise,
        method: captured.method,
      });

      if (outcome === "recorded") {
        summary.settled++;
        /* Loud on purpose, and at `warn` rather than `info`. Every line
           this emits is a payment the webhook should have settled and did
           not, which is the signal that something upstream is broken even
           though the customer has now been made whole. */
        console.warn("[payments] reconciler settled a payment the webhook missed", {
          reference: candidate.order.reference,
          providerOrderId,
        });
        await notifyPaymentSettled({
          providerOrderId,
          providerPaymentId: captured.id,
        });
        /* The customer and the vendors still have to be told, and this
           job is the only thing that will tell them when the webhook
           delivery was lost. Keyed identically to the webhook's own
           send, so a late delivery arriving after this run messages
           nobody twice. Swallows its own errors — one unlucky
           notification must not abort the rest of the batch. */
        await onOrderPlacedForGatewayOrder(providerOrderId);
      } else if (outcome === "duplicate") {
        /* A webhook landed between the query above and this call. Exactly
           what the conditional claim inside the settlement exists for. */
        summary.alreadySettled++;
      } else if (outcome === "amount_mismatch") {
        summary.mismatched++;
        console.error("[payments] captured amount did not match the order", {
          reference: candidate.order.reference,
          providerOrderId,
          capturedPaise: captured.amountPaise,
        });
      }
    } catch (error) {
      /* Per-order, so one unreachable gateway call or one malformed
         response cannot abandon the rest of the batch. The gateway's own
         message is written for integrators and can quote the request
         back, so it is logged and never returned. */
      summary.errors++;
      console.error("[payments] reconciliation failed for an order", {
        reference: candidate.order.reference,
        providerOrderId,
        message: error instanceof RazorpayError ? error.message : "unexpected error",
      });
    }
  }

  if (summary.settled > 0 || summary.mismatched > 0 || summary.awaitingCapture > 0) {
    console.warn("[payments] reconciliation run needed to do work", summary);
  }

  return NextResponse.json({ ok: true, ...summary });
}
