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
 *   - Revenue is *captured* money — `paidAt` set, and not later refunded.
 *     A `PENDING_PAYMENT` order is an abandoned basket far more often than
 *     it is a sale in flight, and counting it makes the business look
 *     several times bigger than it is. But once `paidAt` is set the money
 *     has actually moved; it does not un-move because staff then
 *     confirmed, packed or dispatched the order — see `isRevenueStatus`.
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * The UTC instants bounding one IST calendar month — the month-grained
 * sibling of `resolveIstDayRangeUtc`, for the same reason that function
 * gives: India Standard Time has had no DST and no changes since 1947, so
 * "midnight IST on the 1st" is always exactly UTC−05:30, and a `Date`
 * built from that ISO literal is correct for every month this application
 * will ever query — unlike stepping a UTC `Date` forward by "one month"
 * and hoping the offset held across the step.
 */
export function resolveIstMonthRangeUtc(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(`${pad4(year)}-${pad2(month)}-01T00:00:00+05:30`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(`${pad4(nextYear)}-${pad2(nextMonth)}-01T00:00:00+05:30`);
  return { start, end };
}

function currentIstYearMonth(now: Date): { year: number; month: number } {
  const [year, month] = istDay(now).split("-").map(Number);
  return { year, month };
}

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

/**
 * `?month=YYYY-MM` → the IST year and month it names, falling back to the
 * current IST calendar month for anything absent, malformed, out of range
 * (month 0 or 13), or naming a month that has not happened yet.
 *
 * A future month is folded into the same fallback as a malformed one
 * rather than given its own "nothing here yet" branch — to the person
 * reading the report both cases render the same page, the current
 * month's, so a second code path that produces the identical outcome
 * would only be a second place to keep in sync with this one.
 */
export function parseMonthParam(
  value: string | undefined,
  now: Date = new Date(),
): { year: number; month: number } {
  const current = currentIstYearMonth(now);
  if (!value) return current;

  const match = MONTH_PARAM_RE.exec(value);
  if (!match) return current;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return current;
  if (year > current.year || (year === current.year && month > current.month)) return current;

  return { year, month };
}

/** ---- Revenue -------------------------------------------------------------
 *
 * Whether an order counts as revenue: money was actually received
 * (`paidAt` set) and has not been given back (`status` is not `REFUNDED`).
 *
 * This function used to check `status === "PAID"` alone and, worse, was
 * never actually consulted — `getDashboardMetrics` hardcoded
 * `status: "PAID"` straight into its own `where` clause. The effect: the
 * instant staff moved a paid order on to `CONFIRMED`, `PROCESSING`, or
 * further, `paidAt` stayed exactly where it was but `status` no longer
 * read `"PAID"`, and the money it represented dropped out of "Revenue
 * today" mid-shift — revenue that shrank as staff did their job.
 * `paidAt` being set *is* "money was received"; nothing after that
 * reverses it except an actual refund. `REFUND_PENDING` is a promise to
 * give the money back that the gateway has not yet acted on, so it still
 * holds the money and still counts — only `REFUNDED` does not, and an
 * order with no `paidAt` at all was never money in the first place.
 *
 * Takes `paidAt` as a plain value rather than reading it off an `Order`
 * so this stays a pure predicate: `getDashboardMetrics` below and the
 * monthly report's "Total received" figure
 * (`getMonthlyReport`/`src/app/admin/reports/page.tsx`) both need "paidAt
 * inside a date range", which only Postgres can answer efficiently, so
 * both express this same rule as `{ paidAt: { gte, lt }, status: { not:
 * "REFUNDED" } }` in their own `where` clause rather than calling this
 * function against fetched rows — but it is the one place the rule is
 * written down and tested.
 */
export function isRevenueStatus(status: OrderStatus, paidAt: Date | null): boolean {
  return paidAt != null && status !== "REFUNDED";
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

/** ---- Abandoned online checkouts --------------------------------------
 *
 * The other half of a `PENDING_PAYMENT` order, and `callbackOrdersWhere`'s
 * mirror image: this one *does* have a `Payment` row — the customer was
 * handed to the gateway — and never completed it. That is the ordinary
 * case an abandoned basket is, not work for staff and not a sale, so the
 * monthly report's "orders placed" and "order value" figures exclude it
 * the same way `AWAITING_ACTION_STATUSES` already excludes `PENDING_PAYMENT`
 * from the dashboard's action queue. A callback order (no `Payment` row at
 * all) is not this — it is real, if unpaid, work, and stays counted.
 */
export function abandonedCheckoutWhere() {
  return { status: "PENDING_PAYMENT" as const, payments: { some: {} } };
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
      started last night and paid this morning is this morning's revenue.
      Counts every status except `REFUNDED` — see `isRevenueStatus` — so
      this does not shrink as staff confirm, pack or dispatch a paid
      order. */
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
      /* `status: { not: "REFUNDED" }` is `isRevenueStatus`, expressed as
         a Prisma filter — see that function for why REFUNDED alone is
         excluded and why a bare `status: "PAID"` here was the bug. */
      where: { paidAt: { gte: start, lt: end }, status: { not: "REFUNDED" } },
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

/** ---- Monthly report (impure) ---------------------------------------------
 *
 * "How many orders this month, and how much" — the other half of the
 * owner's ask, at month grain rather than today's. Every figure is
 * GST-inclusive (`totalPaise` already contains it, same as the dashboard)
 * and every count/sum below is a fresh query rather than a derivation
 * from `getDashboardMetrics`'s today-scoped ones.
 */

export interface MonthlyOrderStats {
  year: number;
  month: number;
  /** Orders created in this IST month, excluding an abandoned online
      checkout (`abandonedCheckoutWhere`) — a callback order still counts,
      it is real work that has not been paid for yet, not an abandoned
      basket. */
  ordersPlaced: number;
  /** Sum of `totalPaise` for those same orders, further excluding
      `CANCELLED`, `FAILED` and `REFUNDED` — money that was never charged
      or was given back is not "order value" for the month. GST-inclusive;
      includes orders not yet paid (a callback awaiting a call, or a
      captured-but-not-yet-confirmed order). */
  orderValuePaise: number;
  /** Sum of `totalPaise` where `paidAt` fell in this IST month and
      `status` is not `REFUNDED` — `isRevenueStatus`, scoped to the month
      the money landed rather than the month the order was placed.
      Money actually received, online *and* offline together — this was
      called `paidOnlinePaise` before offline settlement existed, but the
      query it ran was never online-only; every order with `paidAt` set
      counts, regardless of which `Payment.provider` put it there. See
      `paidOnlinePaise`/`receivedOfflinePaise` below for the split. */
  totalReceivedPaise: number;
  /** The same money as `totalReceivedPaise`, restricted to orders whose
      `CAPTURED` payment has `provider: RAZORPAY` — summed from `Payment`,
      not `Order`, but landing on the identical figure in the ordinary
      case: `createGatewayOrder` is always called with `order.totalPaise`
      and `recordOfflinePayment` refuses any amount that is not exactly
      `order.totalPaise` (see `src/lib/data/orders.ts`), and each order
      carries at most one `CAPTURED` payment, so a provider's own
      payments sum to the same total its orders do. Grouping on `Payment`
      rather than `Order` is what lets this and `receivedOfflinePaise`
      partition `totalReceivedPaise` without a second query re-deriving
      "which orders were online" by hand. */
  paidOnlinePaise: number;
  /** `paidOnlinePaise`'s mirror for `provider: OFFLINE` — money the owner
      took by phone and staff recorded through `recordOfflinePayment`. */
  receivedOfflinePaise: number;
  /** Orders created in this IST month whose current status is
      `DELIVERED`. */
  deliveredCount: number;
  /** `orderValuePaise` ÷ the order-value row count, rounded to the
      nearest paise, or `null` when that count is zero — "the average of
      nothing" is not zero, it is undefined, and the report says so rather
      than printing ₹0. The denominator is the exact set `orderValuePaise`
      was summed over (already excludes CANCELLED, FAILED and REFUNDED),
      not a separately-counted "non-cancelled" set that could drift from
      the numerator's own definition. */
  averageOrderPaise: number | null;
}

const ORDER_VALUE_EXCLUDED_STATUSES = ["CANCELLED", "FAILED", "REFUNDED"] as const;

async function computeMonthStats(year: number, month: number): Promise<MonthlyOrderStats> {
  const { start, end } = resolveIstMonthRangeUtc(year, month);
  const createdInMonth = { createdAt: { gte: start, lt: end } };
  /* `isRevenueStatus`, as a `where` clause — reused as both an `Order`
     filter (for `totalReceivedPaise`) and a nested `order` filter on
     `Payment` (for the two below it), so "which orders counted as
     received this month" cannot drift between the three. */
  const receivedInMonth = { paidAt: { gte: start, lt: end }, status: { not: "REFUNDED" as const } };

  const [ordersPlaced, valueAgg, deliveredCount, totalReceivedAgg, paidOnlineAgg, receivedOfflineAgg] =
    await Promise.all([
      db.order.count({ where: { ...createdInMonth, NOT: abandonedCheckoutWhere() } }),
      db.order.aggregate({
        where: {
          ...createdInMonth,
          NOT: abandonedCheckoutWhere(),
          status: { notIn: [...ORDER_VALUE_EXCLUDED_STATUSES] },
        },
        _count: { _all: true },
        _sum: { totalPaise: true },
      }),
      db.order.count({ where: { ...createdInMonth, status: "DELIVERED" } }),
      db.order.aggregate({
        where: receivedInMonth,
        _sum: { totalPaise: true },
      }),
      db.payment.aggregate({
        where: { status: "CAPTURED", provider: "RAZORPAY", order: receivedInMonth },
        _sum: { amountPaise: true },
      }),
      db.payment.aggregate({
        where: { status: "CAPTURED", provider: "OFFLINE", order: receivedInMonth },
        _sum: { amountPaise: true },
      }),
    ]);

  const orderValuePaise = valueAgg._sum.totalPaise ?? 0;
  const averageDenominator = valueAgg._count._all;

  return {
    year,
    month,
    ordersPlaced,
    orderValuePaise,
    totalReceivedPaise: totalReceivedAgg._sum.totalPaise ?? 0,
    paidOnlinePaise: paidOnlineAgg._sum.amountPaise ?? 0,
    receivedOfflinePaise: receivedOfflineAgg._sum.amountPaise ?? 0,
    deliveredCount,
    averageOrderPaise: averageDenominator > 0 ? Math.round(orderValuePaise / averageDenominator) : null,
  };
}

/** `{year, month}` shifted by whole calendar months, carrying the year
    across a December/January boundary in either direction. */
function shiftYearMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const absolute = year * 12 + (month - 1) + delta;
  return { year: Math.floor(absolute / 12), month: (absolute % 12) + 1 };
}

export interface MonthlyReport {
  current: MonthlyOrderStats;
  /** The selected month and the five before it, newest first. */
  recentMonths: MonthlyOrderStats[];
  /** Every status with at least one order created in the selected month,
      most common first. */
  statusBreakdown: { status: OrderStatus; count: number }[];
}

export async function getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
  const months = Array.from({ length: 6 }, (_, i) => shiftYearMonth(year, month, -i));
  const [current, ...previous] = await Promise.all(
    months.map(({ year: y, month: m }) => computeMonthStats(y, m)),
  );

  const { start, end } = resolveIstMonthRangeUtc(year, month);
  const breakdown = await db.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });

  return {
    current,
    recentMonths: [current, ...previous],
    statusBreakdown: breakdown
      .map((group) => ({ status: group.status, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
