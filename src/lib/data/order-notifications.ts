import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/data/notifications";
import { formatPrice } from "@/lib/types/catalog";

/**
 * The bell-icon notifications an order's own status changes ring.
 *
 * Deliberately narrow, and narrow to exactly the four milestones the
 * simplified lifecycle has (`src/lib/orders/lifecycle.ts`) — the same
 * four `notifyCustomerOfStatus` sends a WhatsApp for, because a bell dot
 * and a WhatsApp about different sets of events would be two stories
 * about one order. Every other status is silently a no-op rather than a
 * `default` branch that has to be remembered to stay empty.
 *
 * `CONFIRMED` used to be in here and is gone with the status: the
 * simplified lifecycle has no accept step, nothing writes `CONFIRMED` any
 * more, and a branch for it would be a ring nothing can trigger. `PAID`
 * is excluded for a different reason — `notifyPaymentSettled` below
 * already rings `PAYMENT_SUCCESSFUL` at that exact moment, from the
 * settlement itself, and a second bell for the same event is spam.
 *
 * Called from wherever `transitionOrderStatus` is actually invoked
 * (`POST /api/v1/admin/orders/{reference}/status` — the order board's own
 * advance button posts to that same route, so there is nowhere else that
 * needs this), always *after* the transition's own transaction has
 * committed — see the module comment on `notify` for why.
 */
export async function notifyOrderStatus(input: {
  userId: string;
  reference: string;
  status: OrderStatus;
  /**
   * Whether money was ever captured for this order — i.e. whether it was
   * ever *placed*.
   *
   * Read only by the `CANCELLED` branch, and it has to be: `CANCELLED` is
   * reachable straight from `PENDING_PAYMENT`, which is where abandoned
   * checkouts live forever (see the enum's own comment). Staff tidying
   * those up must not ring the bell for everyone who once reached the
   * gateway and changed their mind. The same guard, for the same reason,
   * as `wasPlaced` in `src/lib/data/order-whatsapp.ts` — one order, one
   * decision about whether there is anything to tell anybody.
   *
   * Optional, defaulting to false, so a caller that cannot answer errs
   * towards silence rather than towards a notification nobody asked for.
   */
  wasPlaced?: boolean;
}): Promise<void> {
  switch (input.status) {
    case "DISPATCHED":
      await notify({
        userId: input.userId,
        kind: "ORDER_SHIPPED",
        title: `Order ${input.reference} is on its way`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:DISPATCHED`,
      });
      return;

    case "OUT_FOR_DELIVERY":
      await notify({
        userId: input.userId,
        kind: "ORDER_SHIPPED",
        title: `Order ${input.reference} is out for delivery`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:OUT_FOR_DELIVERY`,
      });
      return;

    case "DELIVERED":
      await notify({
        userId: input.userId,
        kind: "ORDER_DELIVERED",
        title: `Order ${input.reference} delivered`,
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:DELIVERED`,
      });
      return;

    case "CANCELLED":
      if (!input.wasPlaced) return;
      /* `ORDER_CONFIRMED` is the nearest kind on `NotificationKind` and
         would be a lie, so this reuses nothing: a cancellation is an
         order-state change, which is what `ORDER_SHIPPED`'s siblings all
         are, and inventing an `ORDER_CANCELLED` kind would be a schema
         migration for one row's icon. `PROJECT_UPDATE` is the honest
         generic — the title carries the meaning, and the WhatsApp the
         customer also receives carries the refund line. */
      await notify({
        userId: input.userId,
        kind: "PROJECT_UPDATE",
        title: `Order ${input.reference} cancelled`,
        body: "If anything was paid for this order, we'll be in touch about it.",
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:CANCELLED`,
      });
      return;

    default:
      return;
  }
}

/**
 * Rings the bell for a payment that has just settled.
 *
 * Lifted out of the Razorpay webhook handler, which had it inline, the
 * moment a second caller appeared: the reconciler
 * (`/api/v1/cron/reconcile-payments`) settles exactly the same way for
 * exactly the same reason, and a customer whose payment was recovered by
 * the scheduler rather than the webhook must be told the same thing. Two
 * copies of this would be two places for the dedupe key to drift.
 *
 * Swallows everything, deliberately, and both callers rely on that. The
 * settlement has already committed by the time this runs; a failed
 * bell-icon write must never turn a genuinely settled payment into an
 * error its caller reports — for the webhook that would mean a 500 and
 * hours of Razorpay retries, and for the reconciler it would mean one
 * unlucky notification aborting the rest of the batch.
 */
export async function notifyPaymentSettled(input: {
  providerOrderId: string;
  /** Keys the dedupe, so two settlements of one payment ring once. */
  providerPaymentId: string;
}): Promise<void> {
  try {
    const settled = await db.payment.findUnique({
      where: { providerOrderId: input.providerOrderId },
      select: {
        order: { select: { userId: true, reference: true, totalPaise: true } },
      },
    });
    if (!settled) return;

    await notify({
      userId: settled.order.userId,
      kind: "PAYMENT_SUCCESSFUL",
      title: "Payment successful",
      body: `We've received ${formatPrice(settled.order.totalPaise)} for order ${settled.order.reference}.`,
      href: `/account/orders/${settled.order.reference}`,
      /* Keyed on the gateway payment id, not the order — a redelivered
         `payment.captured`, or a reconciler run racing a late webhook,
         must not bell twice, and two distinct payments could not share
         this key regardless. */
      dedupeKey: `payment:${input.providerPaymentId}`,
    });
  } catch (error) {
    console.error("[payments] failed to notify after settlement", error);
  }
}
