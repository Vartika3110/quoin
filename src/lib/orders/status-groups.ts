import type { OrderStatus } from "@prisma/client";

/**
 * Which order statuses mean what, for every screen that has to agree.
 *
 * The account dashboard's "active orders", the order centre's tabs and a
 * project's spend all bucket `OrderStatus`; three private copies of those
 * buckets is how a project says ₹40,000 spent while the orders page shows
 * the same order as cancelled. Pure and client-safe — type-only import,
 * string literals at runtime.
 */

/**
 * Money has actually moved and has not come back. `REFUND_PENDING` stays in
 * — the refund is agreed, not processed, and the customer is still out of
 * pocket until `REFUNDED`.
 */
export const MONEY_MOVED_STATUSES = [
  "PAID",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "DISPATCHED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REFUND_PENDING",
] as const satisfies readonly OrderStatus[];

export function moneyMoved(status: OrderStatus): boolean {
  return (MONEY_MOVED_STATUSES as readonly OrderStatus[]).includes(status);
}

/**
 * Paid and still on its way. A `PENDING_PAYMENT` order is deliberately not
 * here: an abandoned online checkout sits in that status forever, and
 * counting every one as an "active order" inflates the dashboard with
 * attempts. Callers that want a callback order (pending, no gateway
 * `Payment` row) to count add it with their own query — see the note on
 * `OrderStatus.PENDING_PAYMENT` in the schema.
 */
export const IN_FLIGHT_STATUSES = [
  "PAID",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "DISPATCHED",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[];

export type OrderTab = "all" | "processing" | "shipped" | "delivered" | "cancelled";

export const ORDER_TABS: { id: OrderTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

/** `FAILED` lives under Cancelled: the account has no pay-again control,
    so a failed attempt is not something still being processed. */
export const ORDER_TAB_STATUSES: Record<Exclude<OrderTab, "all">, readonly OrderStatus[]> = {
  processing: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PROCESSING", "PACKED"],
  shipped: ["DISPATCHED", "OUT_FOR_DELIVERY"],
  delivered: ["DELIVERED"],
  cancelled: ["CANCELLED", "FAILED", "REFUND_PENDING", "REFUNDED"],
};

export function parseOrderTab(value: string | undefined): OrderTab {
  return ORDER_TABS.some((t) => t.id === value) ? (value as OrderTab) : "all";
}
