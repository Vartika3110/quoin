import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { istDay } from "@/lib/types/consult";

/**
 * Admin dashboard — the figures a person opens every morning.
 *
 * The difficulty here is not the queries, it is not lying. Every function
 * in this module is written against three rules from the phase brief that
 * are easy to violate by accident:
 *
 *   - Revenue is *captured* money — `status = PAID` only. A
 *     `PENDING_PAYMENT` order is an abandoned basket far more often than
 *     it is a sale in flight, and counting it makes the business look
 *     several times bigger than it is.
 *   - `totalPaise` already contains GST (see `taxForLine`,
 *     `src/lib/data/orders.ts`) — nothing here adds `taxPaise` to it.
 *   - "Today" is the Indian calendar day. The dashboard is opened from
 *     India; a rollover at 5:30am local because the server queried UTC
 *     midnight is wrong for every user of this product.
 *
 * Reused, not reinvented: `istDay` (`src/lib/types/consult.ts`),
 * `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE`/`PAYMENT_STATUS_LABEL`
 * (`src/lib/data/order-history.ts`) are the existing vocabulary for these
 * enums and stay there — this module only adds what did not already exist.
 */

/** ---- IST day boundary ---------------------------------------------------
 *
 * `istDay` gives the calendar date; this turns that date back into the
 * UTC instants Postgres actually compares `createdAt`/`paidAt` against.
 *
 * India Standard Time has no DST and no historical changes since 1947, so
 * "midnight IST" is always exactly UTC−05:30 — the ISO offset literal
 * below is correct for every date this application will ever query,
 * unlike a `Date` built from components and then adjusted by hand.
 */
export function resolveIstDayRangeUtc(now: Date): { start: Date; end: Date } {
  const start = new Date(`${istDay(now)}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** ---- Revenue -------------------------------------------------------------
 *
 * The one-line predicate the brief's money rule reduces to. Kept as a
 * named function rather than inlined into the `where` clause below so the
 * rule has exactly one place to be tested and exactly one place to change
 * if a future status (e.g. a partial refund) needs to count as partial
 * revenue instead of all-or-nothing.
 */
export function isRevenueStatus(status: OrderStatus): boolean {
  return status === "PAID";
}

/** ---- Orders awaiting staff action -----------------------------------------
 *
 * Not "everything not yet delivered" — `PENDING_PAYMENT` is the
 * customer's turn, not staff's, and `DISPATCHED`/`OUT_FOR_DELIVERY` have
 * already left the building for a courier to carry, so a person in this
 * dashboard cannot act on them either. What is left is exactly the queue
 * that sits in front of a person: a payment to confirm, a pick to start
 * or finish, a box to close, or a refund that has been promised but not
 * yet sent to the gateway.
 */
export const AWAITING_ACTION_STATUSES: readonly OrderStatus[] = [
  "PAID",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "REFUND_PENDING",
];

/** ---- Orders waiting for a phone call --------------------------------------
 *
 * Counted separately from the queue above, and it is currently the more
 * important of the two.
 *
 * `PENDING_PAYMENT` is usually the customer's turn — an abandoned basket
 * is the ordinary case and is not work. But when the gateway is not
 * configured, checkout deliberately still writes the order and promises
 * that "an expert calls back within the hour to take payment". Those
 * orders are the entire work queue, and folding them into
 * `PENDING_PAYMENT` at large would bury them among abandoned baskets while
 * showing staff a reassuring zero.
 *
 * The two are told apart by whether a `Payment` row exists: one is written
 * the moment a customer is handed to the gateway, so an order with none
 * never reached it and is a callback. That is a property of the data
 * rather than a flag someone has to remember to set.
 */
export function callbackOrdersWhere() {
  return { status: "PENDING_PAYMENT" as const, payments: { none: {} } };
}

/** ---- Pagination -----------------------------------------------------------
 *
 * Mirrors `resolveOrderPage` (`src/lib/data/order-history.ts`) rather than
 * importing it: that function is scoped to a customer's own order history
 * and owned by a module outside this phase's file list, and the customers
 * list has its own default/max page size to answer for. Duplicated shape,
 * independent policy.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export interface ResolvedAdminPage {
  page: number;
  pageSize: number;
  skip: number;
}

/**
 * Truncates to a whole number, falling back to `fallback` for `undefined`
 * or anything non-finite — but not for `0`. `0 || fallback` would read as
 * equivalent and would be the bug: a genuinely-zero page size must clamp
 * to 1 below, not be treated as "not supplied" and silently widened back
 * to the default.
 */
function wholeOr(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const truncated = Math.trunc(value);
  return Number.isFinite(truncated) ? truncated : fallback;
}

/** Pure so the bounds are testable without a database. */
export function resolveAdminPage(page?: number, pageSize?: number): ResolvedAdminPage {
  const boundedPageSize = Math.min(
    Math.max(1, wholeOr(pageSize, DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  );
  const boundedPage = Math.max(1, wholeOr(page, 1));
  return {
    page: boundedPage,
    pageSize: boundedPageSize,
    skip: (boundedPage - 1) * boundedPageSize,
  };
}

/** ---- Dashboard metrics (impure) ------------------------------------------- */

export interface PaymentStatusCount {
  status: PaymentStatus;
  count: number;
}

export interface DashboardMetrics {
  /** Orders placed today (IST), any status — the raw funnel count. */
  ordersToday: number;
  /** Money actually captured today (IST). Scoped to *when the payment
      landed* (`paidAt`), not when the order was created — a basket
      started last night and paid this morning is this morning's revenue. */
  revenueTodayPaise: number;
  ordersAwaitingAction: number;
  /** Orders that promised the customer a phone call and have had none of
      the gateway involved. See `callbackOrdersWhere`. */
  ordersAwaitingCallback: number;
  /** `tracked` is how many `InventoryItem` rows exist for a
      `stockTracked` product at all — nearly the whole catalogue is opt-out
      of this by design, so `tracked` can legitimately be a tiny fraction
      of the catalogue. `low` is only meaningful relative to it. */
  lowStock: { tracked: number; low: number };
  /** Non-staff accounts. */
  totalCustomers: number;
  /** Payment *attempts* (`Payment` rows, not orders) created today,
      grouped by gateway status — a checkout retried three times today
      shows as three rows here, which is the honest count of "how much
      trouble are people having paying" rather than a count of orders. */
  paymentBreakdownToday: PaymentStatusCount[];
}

export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
  const { start, end } = resolveIstDayRangeUtc(now);

  const [
    ordersToday,
    revenueAgg,
    ordersAwaitingAction,
    ordersAwaitingCallback,
    totalCustomers,
    paymentGroups,
    inventoryRows,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.order.aggregate({
      where: { status: "PAID", paidAt: { gte: start, lt: end } },
      _sum: { totalPaise: true },
    }),
    db.order.count({ where: { status: { in: [...AWAITING_ACTION_STATUSES] } } }),
    db.order.count({ where: callbackOrdersWhere() }),
    db.user.count({ where: { isStaff: false } }),
    db.payment.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    /* Selecting only the three columns the low-stock arithmetic needs,
       for tracked items only. Prisma cannot compare two columns of the
       same row inside a `where` without raw SQL. `src/lib/data/inventory.ts`
       does reach for `$executeRaw` where it must — the reserve guard has
       to be one conditional statement or it does not prevent overselling
       — but that is a correctness requirement, and this is a dashboard
       count. `InventoryItem` is opt-in and expected to stay a small table,
       so reading the tracked rows and reducing in JS is the cheap option
       here rather than a shortcut around one. */
    db.inventoryItem.findMany({
      where: { variant: { product: { stockTracked: true } } },
      select: { onHandQty: true, reservedQty: true, lowStockThreshold: true },
    }),
  ]);

  const lowCount = inventoryRows.filter(
    (item) => item.onHandQty - item.reservedQty <= item.lowStockThreshold,
  ).length;

  return {
    ordersToday,
    revenueTodayPaise: revenueAgg._sum.totalPaise ?? 0,
    ordersAwaitingAction,
    ordersAwaitingCallback,
    lowStock: { tracked: inventoryRows.length, low: lowCount },
    totalCustomers,
    paymentBreakdownToday: paymentGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    })),
  };
}
