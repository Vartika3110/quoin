import { OrderStatus, Prisma } from "@prisma/client";
import type { PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { Paise } from "@/lib/types/catalog";
import { maskPhone } from "@/lib/auth/phone";
import { callbackOrdersWhere, resolveIstDayRangeUtc } from "@/lib/data/admin-metrics";
import { isAdminTransitionAllowed } from "@/lib/data/admin-orders";

/**
 * The order board — every order by stage, in columns, one tap to move it
 * along. The restaurant-app pattern the owner asked for: `AWAITING_ACTION_STATUSES`
 * (`src/lib/data/admin-metrics.ts`) already answers "how many", this
 * answers "which ones, and what do I do about each one right now".
 *
 * Nothing here is a second write path. Every advance goes through
 * `POST /api/v1/admin/orders/{reference}/status`, the same route the
 * order detail page's `OrderStatusForm` already calls, which itself only
 * ever calls `transitionOrderStatus` — this module decides which single
 * button to offer, never writes a status itself.
 */

/** ---- Column mapping (pure) --------------------------------------------- */

export type BoardColumnKey =
  | "new"
  | "confirmed"
  | "preparing"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export const BOARD_COLUMNS: readonly BoardColumnKey[] = [
  "new",
  "confirmed",
  "preparing",
  "on_the_way",
  "delivered",
  "cancelled",
];

export const BOARD_COLUMN_LABEL: Record<BoardColumnKey, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled / refunds",
};

/**
 * Which column a status structurally belongs to.
 *
 * A `Record` over every `OrderStatus`, not a `switch`, so a thirteenth
 * status added to the schema without a line here is a type error rather
 * than a card silently missing from every column — the same reasoning as
 * `FULFILMENT_LABEL` (`src/lib/data/admin-orders.ts`).
 *
 * This says nothing about *whether* a `PENDING_PAYMENT` order belongs on
 * the board at all — a pure function of the status alone cannot know
 * whether a `Payment` row exists, and an abandoned online checkout
 * (`PENDING_PAYMENT` *with* a payment attempt) is not staff's work. That
 * distinction is drawn once, in `callbackOrdersWhere()`
 * (`src/lib/data/admin-metrics.ts`), and `getOrderBoard` below applies it
 * on top of this mapping for the "new" column's query. The mapping still
 * has to place `PENDING_PAYMENT` somewhere for the exhaustiveness check to
 * type-check, and "new" is where a callback order — the only
 * `PENDING_PAYMENT` case this board actually shows — belongs.
 */
const STATUS_COLUMN: Record<OrderStatus, BoardColumnKey> = {
  PENDING_PAYMENT: "new",
  PAID: "new",
  CONFIRMED: "confirmed",
  PROCESSING: "preparing",
  PACKED: "preparing",
  DISPATCHED: "on_the_way",
  OUT_FOR_DELIVERY: "on_the_way",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  REFUND_PENDING: "cancelled",
  REFUNDED: "cancelled",
  FAILED: "cancelled",
};

export function boardColumnForStatus(status: OrderStatus): BoardColumnKey {
  return STATUS_COLUMN[status];
}

/** ---- One-tap advance (pure) --------------------------------------------- */

/**
 * The happy-path "next" status a single tap on a card should offer —
 * independent of whether the move is actually legal *today*.
 * `buildCard` below still asks `isAdminTransitionAllowed` (the same guard
 * `transitionOrderStatus` itself enforces) before it puts a button on a
 * card; this table only says what "forward" means.
 *
 * `PAID` never appears as a value: only the Razorpay webhook may set it
 * (`PaidNotAdminSettableError`, `src/lib/data/admin-orders.ts`), so no tap
 * anywhere on this board can offer it. Every status off the happy path
 * (`FAILED`, `REFUND_PENDING`, `REFUNDED`, `CANCELLED`) and the last
 * happy-path stop (`DELIVERED`) return `null` — there is no further
 * forward move, only the detail page's other actions (cancel, refund).
 *
 * `PENDING_PAYMENT`'s entry is `CONFIRMED` structurally — the customer's
 * next milestone — but `canTransition` does not actually allow that edge
 * (see the note on `getOrderBoard`), so in practice a callback card never
 * shows this button. Left in the table anyway, rather than `null`, so the
 * illegality is visible at the one call site that checks it instead of
 * being pre-decided and hidden here.
 */
const FORWARD_NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  PENDING_PAYMENT: "CONFIRMED",
  PAID: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "PACKED",
  PACKED: "DISPATCHED",
  DISPATCHED: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
  FAILED: null,
  REFUND_PENDING: null,
  REFUNDED: null,
};

export function forwardNextStatus(status: OrderStatus): OrderStatus | null {
  return FORWARD_NEXT_STATUS[status];
}

/** ---- Relative time (pure) ------------------------------------------------ */

/**
 * "12 min ago", not a clock face — the board is read at a glance, and
 * relative age is what tells someone which card has been sitting the
 * longest. Rounded rather than floored so "59.6 minutes" reads as "1 hr
 * ago", matching the age a person would say out loud. The caller passes
 * `now` explicitly (rather than this reading `Date.now()`) so it stays
 * pure and testable; the board page passes the same `Date` it loaded the
 * data with, so the figure and the 30s auto-refresh advance together.
 */
export function formatRelativeIst(date: Date, now: Date): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/** ---- Recent window (pure) ------------------------------------------------ */

/**
 * "Last 7 IST days" — today's IST calendar day plus the six before it,
 * ending *now* rather than at the end of today. `resolveIstDayRangeUtc`
 * (`src/lib/data/admin-metrics.ts`) gives today's own start for the same
 * DST-free reason documented there; this only steps it back six more
 * whole days rather than re-deriving the IST offset.
 */
export function resolveRecentIstWindowUtc(now: Date, days: number): { start: Date; end: Date } {
  const { start: todayStart } = resolveIstDayRangeUtc(now);
  const start = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

const RECENT_WINDOW_DAYS = 7;

/** Each column shows at most this many cards; the rest are "+N more". */
const CARD_CAP = 50;

/** ---- Cards / columns (impure) -------------------------------------------- */

export interface AdminBoardCard {
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  /** Name, else masked phone, else email — the same fallback order
      `/admin/orders` already renders across its two table cells, folded
      into one line here. */
  customerLabel: string;
  shipCity: string;
  shipPincode: string;
  itemCount: number;
  totalPaise: Paise;
  /** Null when nothing has reached the gateway yet — see `isCallback`. */
  paymentStatus: PaymentStatus | null;
  /** `PENDING_PAYMENT` with no `Payment` row — see `callbackOrdersWhere`. */
  isCallback: boolean;
  /** The single forward status a tap should offer, or `null` when there
      is none today — either this status has no happy-path next step, or
      it does but `isAdminTransitionAllowed` refuses it (a callback order,
      see the note on `getOrderBoard`). */
  nextStatus: OrderStatus | null;
}

export interface AdminBoardColumn {
  key: BoardColumnKey;
  label: string;
  /** Every matching order, not just the ones shown — the header's count
      is honest even when the column is capped. */
  count: number;
  totalPaise: Paise;
  items: AdminBoardCard[];
  /** `count - items.length`, floored at 0. */
  moreCount: number;
  /** Where "+N more" sends staff. `/admin/orders` filters by exactly one
      `?status=`, and every column but "Confirmed" spans more than one
      status (or, for "new", a status *and* a payments condition that page
      cannot express) — so this is the one status in the column most
      worth chasing, not a complete description of it. */
  overflowStatus: OrderStatus;
}

export interface AdminBoard {
  columns: AdminBoardColumn[];
}

function customerLabel(user: { name: string | null; phone: string | null; email: string | null }): string {
  if (user.name) return user.name;
  if (user.phone) return maskPhone(user.phone);
  if (user.email) return user.email;
  return "Unnamed account";
}

async function fetchColumn(where: Prisma.OrderWhereInput): Promise<{
  count: number;
  totalPaise: Paise;
  items: AdminBoardCard[];
}> {
  const [agg, rows] = await Promise.all([
    db.order.aggregate({ where, _count: { _all: true }, _sum: { totalPaise: true } }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CARD_CAP,
      select: {
        reference: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        shipCity: true,
        shipPincode: true,
        user: { select: { name: true, phone: true, email: true } },
        _count: { select: { lines: true } },
        /* Same reasoning as `listAdminOrders`: grain is a checkout
           attempt, not the order, so the most recent row is where this
           order's payment currently stands. */
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
  ]);

  return {
    count: agg._count._all,
    totalPaise: agg._sum.totalPaise ?? 0,
    items: rows.map((row) => {
      const forward = forwardNextStatus(row.status);
      return {
        reference: row.reference,
        status: row.status,
        createdAt: row.createdAt,
        customerLabel: customerLabel(row.user),
        shipCity: row.shipCity,
        shipPincode: row.shipPincode,
        itemCount: row._count.lines,
        totalPaise: row.totalPaise,
        paymentStatus: row.payments[0]?.status ?? null,
        isCallback: row.status === "PENDING_PAYMENT" && row.payments.length === 0,
        nextStatus: forward && isAdminTransitionAllowed(row.status, forward) ? forward : null,
      };
    }),
  };
}

/**
 * The board, six columns wide.
 *
 * **A callback order cannot one-tap to "Confirmed" today.** `canTransition`
 * (`src/lib/data/orders.ts`) allows `PENDING_PAYMENT -> PAID | FAILED |
 * CANCELLED` only — there is no `PENDING_PAYMENT -> CONFIRMED` edge, so
 * `isAdminTransitionAllowed` refuses it and `nextStatus` comes back `null`
 * for every callback card. This is deliberate on this module's part: the
 * spec for this board asked to report that fact, not change the state
 * machine to make it true, so those cards render with no advance button
 * and link to the detail page instead, same as any other order with no
 * legal forward move.
 *
 * "Delivered" and "Cancelled / refunds" both filter on `Order.updatedAt`
 * rather than joining `OrderStatusChange` for "when did this status
 * change" — checked against every writer of the `Order` row
 * (`transitionOrderStatus` and `settleCapturedPayment`,
 * `src/lib/data/admin-orders.ts` / `orders.ts`): both always set `status`
 * in the same write that touches anything else on the row, so `updatedAt`
 * *is* "the latest status change time" for every order that has reached
 * one of these terminal-for-this-board statuses — there is no later,
 * unrelated write that could make it stale. A join over `OrderStatusChange`
 * would answer the identical question at the cost of a second table scan.
 */
export async function getOrderBoard(now: Date = new Date()): Promise<AdminBoard> {
  const { start: recentStart } = resolveRecentIstWindowUtc(now, RECENT_WINDOW_DAYS);

  const [newCol, confirmedCol, preparingCol, onTheWayCol, deliveredCol, cancelledCol] =
    await Promise.all([
      fetchColumn({ OR: [callbackOrdersWhere(), { status: "PAID" }] }),
      fetchColumn({ status: "CONFIRMED" }),
      fetchColumn({ status: { in: ["PROCESSING", "PACKED"] } }),
      fetchColumn({ status: { in: ["DISPATCHED", "OUT_FOR_DELIVERY"] } }),
      fetchColumn({ status: "DELIVERED", updatedAt: { gte: recentStart } }),
      fetchColumn({
        status: { in: ["CANCELLED", "REFUND_PENDING", "REFUNDED", "FAILED"] },
        updatedAt: { gte: recentStart },
      }),
    ]);

  const build = (
    key: BoardColumnKey,
    col: { count: number; totalPaise: Paise; items: AdminBoardCard[] },
    overflowStatus: OrderStatus,
  ): AdminBoardColumn => ({
    key,
    label: BOARD_COLUMN_LABEL[key],
    count: col.count,
    totalPaise: col.totalPaise,
    items: col.items,
    moreCount: Math.max(0, col.count - col.items.length),
    overflowStatus,
  });

  return {
    columns: [
      build("new", newCol, "PAID"),
      build("confirmed", confirmedCol, "CONFIRMED"),
      build("preparing", preparingCol, "PROCESSING"),
      build("on_the_way", onTheWayCol, "DISPATCHED"),
      build("delivered", deliveredCol, "DELIVERED"),
      build("cancelled", cancelledCol, "CANCELLED"),
    ],
  };
}
