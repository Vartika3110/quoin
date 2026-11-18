import type { OrderStatus } from "@prisma/client";

/**
 * The order lifecycle, as the customer and the vendor are allowed to see it.
 *
 * `ORDER_TRANSITIONS` (`src/lib/data/orders.ts`) is still the machine —
 * twelve statuses, because money has states that fulfilment does not and
 * a refund has to be reachable from nearly all of them. This module is
 * the narrower thing laid over it: the **four** stages an order actually
 * moves through, plus the one exceptional outcome.
 *
 *   placed → dispatched → out for delivery → delivered
 *                                      cancelled
 *
 * There is deliberately no accepted, preparing or ready stage. A vendor
 * does not accept a Quoin order — they are told about it and they
 * dispatch it — so the three statuses that used to sit between PAID and
 * DISPATCHED (`CONFIRMED`, `PROCESSING`, `PACKED`) are **retired**: no
 * route offers them as a destination any more, nothing writes them, and
 * `RETIRED_FULFILMENT_STATUSES` below is the list of them so that the one
 * place that has to know (the admin's set of legal moves) reads it rather
 * than hard-coding three names.
 *
 * They are not deleted from the enum. Orders placed before this existed
 * passed through them, their `OrderStatusChange` rows say so, and that
 * history must survive — so every status still maps to a stage here, and
 * all three retired ones map to `placed`, which is what a customer
 * waiting for a parcel would have understood them to mean anyway.
 *
 * Pure and `db`-free by construction: only a *type* is imported from
 * `@prisma/client`, which erases at compile time, so this file carries no
 * runtime dependency on Prisma and is safe to import from a client
 * component. Same constraint, for the same reason, as
 * `src/lib/orders/timeline.ts`.
 */

/** The only stages anybody outside this codebase is shown. */
export type OrderStage = "placed" | "dispatched" | "out_for_delivery" | "delivered" | "cancelled";

/**
 * The happy path, in order. `cancelled` is not in it — it is not a
 * further stage, it is leaving the line, which is why the stepper and the
 * admin timeline both treat it separately.
 */
export const ORDER_STAGE_SEQUENCE = [
  "placed",
  "dispatched",
  "out_for_delivery",
  "delivered",
] as const satisfies readonly OrderStage[];

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  placed: "Order placed",
  dispatched: "Dispatched",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Which stage a raw `OrderStatus` reads as, or `null` for a status that
 * is not on the lifecycle at all.
 *
 * A `Record` over every status rather than a `switch` with a default, so
 * a thirteenth status added to the schema without a line here is a type
 * error and not an order that silently disappears from a stepper.
 *
 * The nulls are the interesting part:
 *
 *  - `PENDING_PAYMENT` — the order exists but nothing has been paid for
 *    it. An abandoned checkout sits here forever (see the enum's own
 *    comment), and calling that "placed" would both tell the customer
 *    something untrue and put an unpaid basket in front of a vendor.
 *  - `FAILED` — a gateway attempt that did not go through. The customer
 *    can still pay the same order, so it has not left the line either.
 *  - `REFUND_PENDING` / `REFUNDED` — money going back. These describe a
 *    payment, not a parcel, and they are deliberately not folded into
 *    `cancelled`: a delivered order can be refunded without the delivery
 *    un-happening.
 */
const STAGE_FOR_STATUS: Record<OrderStatus, OrderStage | null> = {
  PENDING_PAYMENT: null,
  FAILED: null,
  /* The moment money is confirmed is the moment the order is placed —
     this is what `order_placed_customer` and `new_order_vendor` fire on. */
  PAID: "placed",
  /* Retired, and mapped here only so history renders. */
  CONFIRMED: "placed",
  PROCESSING: "placed",
  PACKED: "placed",
  DISPATCHED: "dispatched",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUND_PENDING: null,
  REFUNDED: null,
};

export function stageForStatus(status: OrderStatus): OrderStage | null {
  return STAGE_FOR_STATUS[status];
}

/**
 * The statuses that used to sit between PAID and DISPATCHED and no longer
 * do. Read by `isAdminTransitionAllowed` (`src/lib/data/admin-orders.ts`)
 * so there is exactly one list of them.
 *
 * Retired as *destinations* only. An order already sitting in one of them
 * when this shipped can still be moved forward — see the edges added to
 * `ORDER_TRANSITIONS` — because the alternative is an order stuck where
 * no button can reach it.
 */
export const RETIRED_FULFILMENT_STATUSES = [
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
] as const satisfies readonly OrderStatus[];

export function isRetiredStatus(status: OrderStatus): boolean {
  return (RETIRED_FULFILMENT_STATUSES as readonly OrderStatus[]).includes(status);
}

/**
 * The status that *is* each stage — the inverse of `STAGE_FOR_STATUS` for
 * the four stages a write can target. `placed` has no entry: nothing
 * transitions an order *to* placed, a captured payment does that, and
 * exposing `PAID` here would hand a caller the one status only the
 * webhook and the offline-payment action may set.
 */
export const STATUS_FOR_STAGE: Record<Exclude<OrderStage, "placed">, OrderStatus> = {
  dispatched: "DISPATCHED",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};
