import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { Paise } from "@/lib/types/catalog";

/**
 * Order history — the read side of `src/lib/data/orders.ts`.
 *
 * That module writes orders and settles payments; nothing in it answers
 * "what has this customer bought". This module only ever reads, and every
 * read here is scoped to one `userId` inside the `where` clause itself —
 * never a `findUnique`/`findFirst` on `reference` alone followed by an
 * ownership check afterwards. `reference` is a six-character, phone-quotable
 * code (`generateReference`, src/lib/reference.ts) — guessable by design —
 * so the database, not application logic layered on top of a wider query,
 * has to be what decides whether a row is this customer's to see.
 */

/** ---- Status vocabulary ---------------------------------------------------
 * `OrderStatus` and `PaymentStatus` are gateway/ops vocabulary
 * (`src/lib/data/orders.ts`, `ORDER_TRANSITIONS`). Neither reads well on a
 * customer's own screen verbatim, and a `Record` over each enum — rather
 * than a `switch` with a default case — means adding a status to the
 * schema without adding it here is a type error, not a silently blank
 * badge.
 */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  PAID: "Paid",
  FAILED: "Payment failed",
  CANCELLED: "Cancelled",
  CONFIRMED: "Confirmed",
  PROCESSING: "Being prepared",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

/**
 * Mirrors `Badge`'s own tone union (`src/components/ui/Badge.tsx`)
 * structurally rather than importing it — that component does not export
 * `Tone`, and duplicating an eight-value string literal union here is
 * cheaper than widening a shared primitive's public surface for one
 * caller.
 */
export type OrderStatusTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "pro"
  | "deep";

/**
 * Which tone reads each status correctly, following the same rule the
 * services page already uses (`STATUS_TONE`,
 * `src/app/account/services/page.tsx`): `warning` where the customer still
 * has to do something, `accent` for the stage they are most likely
 * watching for, `success` once money or goods have actually moved,
 * `danger` for a failure, `neutral` for a state with nowhere further to go
 * that was not itself a success.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, OrderStatusTone> = {
  PENDING_PAYMENT: "warning",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  CONFIRMED: "info",
  PROCESSING: "info",
  PACKED: "info",
  DISPATCHED: "accent",
  OUT_FOR_DELIVERY: "accent",
  DELIVERED: "success",
  REFUND_PENDING: "warning",
  REFUNDED: "neutral",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: "Awaiting payment",
  AUTHORIZED: "Authorized",
  CAPTURED: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

/** ---- Pagination ----------------------------------------------------------
 * Bounded the same way `listProducts` bounds `?page=`/`?pageSize=`
 * (`src/lib/data/catalog.ts`): clamped rather than rejected, because a
 * stale or hand-edited page parameter on a customer's own order history
 * should still return something rather than a 400.
 */

export const DEFAULT_ORDER_PAGE_SIZE = 20;
const MAX_ORDER_PAGE_SIZE = 50;

export interface ResolvedOrderPage {
  page: number;
  pageSize: number;
  skip: number;
}

/**
 * Truncates to a whole number, falling back to `fallback` for `undefined`
 * or anything non-finite (`NaN`, `Infinity`) — but *not* for `0`. `0 ||
 * fallback` would look equivalent and is the bug this function exists to
 * avoid: a genuinely-zero `pageSize` must clamp to 1 below, not be treated
 * as "not supplied" and silently widened back to the default.
 */
function wholeOr(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const truncated = Math.trunc(value);
  return Number.isFinite(truncated) ? truncated : fallback;
}

/** Pure so pagination bounds are testable without a database. */
export function resolveOrderPage(page?: number, pageSize?: number): ResolvedOrderPage {
  const boundedPageSize = Math.min(
    Math.max(1, wholeOr(pageSize, DEFAULT_ORDER_PAGE_SIZE)),
    MAX_ORDER_PAGE_SIZE,
  );
  const boundedPage = Math.max(1, wholeOr(page, 1));
  return {
    page: boundedPage,
    pageSize: boundedPageSize,
    skip: (boundedPage - 1) * boundedPageSize,
  };
}

/** ---- Summary (list) ------------------------------------------------------- */

export interface OrderSummary {
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  totalPaise: Paise;
  /** Count of distinct order lines, not total quantity — "3 items", not
      "14 units". */
  itemCount: number;
  /** Titles of the first couple of lines, enough to recognise the order
      at a glance without shipping every line to a list view. */
  previewTitles: string[];
}

export interface OrderSummaryPage {
  items: OrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * The signed-in customer's own orders, newest first.
 *
 * Scoped by `userId` in the `where` clause with no way to override it —
 * there is no `?userId=` here for a caller to widen.
 */
export async function listOrdersForUser(
  userId: string,
  page?: number,
  pageSize?: number,
): Promise<OrderSummaryPage> {
  const resolved = resolveOrderPage(page, pageSize);

  const [total, rows] = await Promise.all([
    db.order.count({ where: { userId } }),
    db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: resolved.skip,
      take: resolved.pageSize,
      select: {
        reference: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        _count: { select: { lines: true } },
        /* `OrderLine` has no position column — ordered by `id` instead.
           `cuid()` embeds a creation timestamp, so ascending id recovers
           the basket order `createPendingOrder` wrote the lines in
           closely enough to show "the first couple of things bought". */
        lines: { orderBy: { id: "asc" }, take: 2, select: { title: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      reference: row.reference,
      status: row.status,
      createdAt: row.createdAt,
      totalPaise: row.totalPaise,
      itemCount: row._count.lines,
      previewTitles: row.lines.map((line) => line.title),
    })),
    page: resolved.page,
    pageSize: resolved.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / resolved.pageSize)),
  };
}

/** ---- Detail (one order, in full) ------------------------------------------ */

export interface OrderLineDetail {
  productSlug: string;
  variantId: string;
  sku: string;
  title: string;
  variantLabel: string;
  qty: number;
  unitPricePaise: Paise;
  mrpPaise: Paise | null;
  /** `unitPricePaise * qty`, before tax — see `OrderLine.linePaise`. */
  linePaise: Paise;
  gstRatePct: number;
  taxPaise: Paise;
}

export interface OrderShippingSnapshot {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderPaymentSummary {
  status: PaymentStatus;
  method: string | null;
}

export interface OrderDetail {
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  lines: OrderLineDetail[];
  /** GST-inclusive, matching the catalogue — see `taxForLine`,
      `src/lib/data/orders.ts`. `taxPaise` is a component already inside
      `subtotalPaise`, never an amount added on top of it. */
  subtotalPaise: Paise;
  taxPaise: Paise;
  discountPaise: Paise;
  deliveryFeePaise: Paise;
  totalPaise: Paise;
  currency: string;
  shipping: OrderShippingSnapshot;
  /** The most recent trip to the gateway. Null only for an order written
      and then abandoned before a gateway order ever existed for it — see
      `createPendingOrder`, `src/lib/data/orders.ts`. */
  payment: OrderPaymentSummary | null;
}

/**
 * One order, in full — but only when it belongs to `userId`.
 *
 * The ownership check is the `where` clause, not a step after it: this is
 * `findFirst({ where: { reference, userId } })`, never a `findUnique` on
 * `reference` alone with the caller's id compared afterwards. A reference
 * that exists but belongs to someone else and a reference that does not
 * exist at all both resolve to `null` here, and both become the same 404
 * in the route — confirming that a *guessed* reference is real would
 * itself be a disclosure to whoever guessed it.
 */
export async function getOrderForUser(
  userId: string,
  reference: string,
): Promise<OrderDetail | null> {
  const order = await db.order.findFirst({
    where: { reference, userId },
    select: {
      reference: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      paidAt: true,
      subtotalPaise: true,
      taxPaise: true,
      discountPaise: true,
      deliveryFeePaise: true,
      totalPaise: true,
      currency: true,
      shipName: true,
      shipPhone: true,
      shipLine1: true,
      shipLine2: true,
      shipLandmark: true,
      shipCity: true,
      shipState: true,
      shipPincode: true,
      lines: {
        orderBy: { id: "asc" },
        select: {
          productSlug: true,
          variantId: true,
          sku: true,
          title: true,
          variantLabel: true,
          qty: true,
          unitPricePaise: true,
          mrpPaise: true,
          linePaise: true,
          gstRatePct: true,
          taxPaise: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, method: true },
      },
    },
  });

  if (!order) return null;

  const [payment] = order.payments;

  return {
    reference: order.reference,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    lines: order.lines,
    subtotalPaise: order.subtotalPaise,
    taxPaise: order.taxPaise,
    discountPaise: order.discountPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    totalPaise: order.totalPaise,
    currency: order.currency,
    shipping: {
      name: order.shipName,
      phone: order.shipPhone,
      line1: order.shipLine1,
      line2: order.shipLine2,
      landmark: order.shipLandmark,
      city: order.shipCity,
      state: order.shipState,
      pincode: order.shipPincode,
    },
    payment: payment ? { status: payment.status, method: payment.method } : null,
  };
}
