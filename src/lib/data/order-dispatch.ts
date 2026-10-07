import { db } from "@/lib/db";
import {
  IllegalOrderTransitionError,
  OrderStatusRaceError,
} from "@/lib/data/orders";
import { transitionOrderStatus } from "@/lib/data/admin-orders";
import {
  dispatchFulfilment,
  FulfilmentNotDispatchableError,
  FulfilmentNotFoundError,
  getFulfilmentByToken,
  type DispatchFulfilmentResult,
} from "@/lib/data/order-fulfilments";
import { notifyOrderStatus } from "@/lib/data/order-notifications";
import { notifyCustomerOfStatus } from "@/lib/data/order-whatsapp";

/**
 * "Dispatch order" — the whole of the vendor's workflow, in one function.
 *
 * The vendor's experience is deliberately one step: they are told about
 * an order and they send it. No accept, no preparing, no ready. What that
 * one tap has to do, in order:
 *
 *  1. Claim their own leg (`dispatchFulfilment`), which is guarded so a
 *     double-tap cannot write twice.
 *  2. If — and only if — that was the **last** outstanding leg, move the
 *     order itself to `DISPATCHED`.
 *  3. Tell the customer, by bell icon and by WhatsApp.
 *
 * Step 2 is the reason this module exists at all. On a single-store order
 * it is immediate and invisible. On a split order it is the difference
 * between a truthful dispatch notification and telling a customer their
 * whole order has left when half of it is still on a shelf in another
 * store. The customer's lifecycle stays four stages long either way:
 * vendor-level state is never exposed to them.
 *
 * It goes through `transitionOrderStatus` rather than writing
 * `Order.status` directly, which is the point of the indirection — one
 * status-writing path in the app, one `canTransition` check, one
 * `OrderStatusChange` audit row, whether the mover was staff, a vendor or
 * a webhook. A second writer here would be a second lifecycle to keep in
 * agreement with the first, and they would not stay in agreement.
 */

export interface DispatchOrderLegResult extends DispatchFulfilmentResult {
  /** True when this call is what moved the *order* to DISPATCHED. False
      on a split order with legs still outstanding, and false when
      another request got there first. */
  orderAdvanced: boolean;
  /** How many legs are still waiting, for the vendor's own confirmation
      screen: "we're waiting on one other store" is a better answer than
      silence. */
  outstandingLegs: number;
}

export interface DispatchOrderLegInput {
  fulfilmentId: string;
  /** The staff account acting on the vendor's behalf, or null when the
      vendor used the link in their WhatsApp. Null is meaningful — see
      `TransitionOrderStatusInput.actorUserId`. */
  actorUserId: string | null;
}

export async function dispatchOrderLeg(
  input: DispatchOrderLegInput,
): Promise<DispatchOrderLegResult> {
  const dispatched = await dispatchFulfilment({
    fulfilmentId: input.fulfilmentId,
    actorUserId: input.actorUserId,
  });

  const outstandingLegs = await db.orderFulfilment.count({
    where: { orderId: dispatched.orderId, status: "PENDING" },
  });

  if (!dispatched.allDispatched) {
    /* A split order with work left. Nothing customer-facing happens: the
       customer is told once, when the whole order is on its way, which is
       the one thing "dispatched" can honestly mean to them. */
    return { ...dispatched, orderAdvanced: false, outstandingLegs };
  }

  const advanced = await advanceOrderToDispatched({
    reference: dispatched.orderReference,
    actorUserId: input.actorUserId,
    storeName: dispatched.storeName,
  });

  return { ...dispatched, orderAdvanced: advanced, outstandingLegs };
}

/**
 * Moves the order to `DISPATCHED` and tells the customer.
 *
 * Both failure modes are swallowed and both are correct to swallow,
 * because the vendor's own leg is already committed and the vendor is
 * owed an answer about *their* action:
 *
 *  - `IllegalOrderTransitionError` — the order is not somewhere
 *    `DISPATCHED` can be reached from. The real case is a cancelled
 *    order: `cancelOutstandingFulfilments` closes pending legs, but a
 *    leg dispatched a moment before the cancellation lands can still
 *    arrive here. `CANCELLED` has no outgoing edges, so this is the
 *    machine correctly refusing, not an error to report.
 *  - `OrderStatusRaceError` — somebody else moved it first, which on a
 *    split order is the other vendor finishing in the same second. The
 *    order is already DISPATCHED; there is nothing to do and nothing
 *    wrong.
 *
 * Anything else is logged and still not re-thrown: a vendor must not be
 * shown a failure for a dispatch that did happen.
 */
async function advanceOrderToDispatched(input: {
  reference: string;
  actorUserId: string | null;
  storeName: string;
}): Promise<boolean> {
  try {
    const order = await transitionOrderStatus({
      reference: input.reference,
      toStatus: "DISPATCHED",
      actorUserId: input.actorUserId,
      note: input.actorUserId
        ? `Dispatched on behalf of ${input.storeName}`
        : `Dispatched by ${input.storeName}`,
    });

    /* After the transition has committed, never inside it — the same
       rule the admin status route follows, for the same reason. Both of
       these swallow their own errors.

       `wasPlaced` is deliberately not passed: it is read only by
       `notifyOrderStatus`'s `CANCELLED` branch, and this path only ever
       sends `DISPATCHED`, which is not reachable from an unpaid order. */
    await notifyOrderStatus({
      userId: order.customer.id,
      reference: order.reference,
      status: order.status,
    });
    await notifyCustomerOfStatus({ orderId: order.id, status: order.status });
    return true;
  } catch (error) {
    if (error instanceof IllegalOrderTransitionError) return false;
    if (error instanceof OrderStatusRaceError) return false;
    console.error("[orders] vendor dispatch could not advance the order", {
      reference: input.reference,
      error,
    });
    return false;
  }
}

/**
 * The vendor's own path: resolve their link's token, then dispatch.
 *
 * The token lookup and the dispatch are two statements rather than one
 * because the vendor page has to render the leg before anything is
 * written. `getFulfilmentByToken` is the only way a tokened caller
 * reaches a fulfilment, and it projects that leg's lines alone — see its
 * own comment on why that filtering is the security boundary and not
 * just the presentation.
 */
export async function dispatchByVendorToken(token: string): Promise<DispatchOrderLegResult> {
  const fulfilment = await getFulfilmentByToken(token);
  if (!fulfilment) throw new FulfilmentNotFoundError();

  return dispatchOrderLeg({ fulfilmentId: fulfilment.id, actorUserId: null });
}

export { FulfilmentNotFoundError, FulfilmentNotDispatchableError };
