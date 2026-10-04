import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/data/notifications";
import { formatPrice } from "@/lib/types/catalog";

/**
 * The bell-icon notifications an order's own status changes ring.
 *
 * Deliberately narrow: only the four transitions a customer would
 * actually want pinged for produce one, and every other status (`PAID`
 * itself, `PACKED`, every terminal status) is silently a no-op rather than
 * a `default` branch that has to be remembered to stay empty. `PAID` is
 * excluded on purpose — `PAYMENT_SUCCESSFUL` exists on `NotificationKind`
 * for it, but nothing wires it yet, and pretending this function covers
 * that case would be worse than leaving it honestly unimplemented.
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
}): Promise<void> {
  switch (input.status) {
    case "CONFIRMED":
      await notify({
        userId: input.userId,
        kind: "ORDER_CONFIRMED",
        title: `Order ${input.reference} confirmed`,
        body: "We've accepted your order and are preparing it.",
        href: `/account/orders/${input.reference}`,
        dedupeKey: `order:${input.reference}:CONFIRMED`,
      });
      return;

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
