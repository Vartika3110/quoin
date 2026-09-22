import { Prisma } from "@prisma/client";
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { resolvePhoto } from "@/lib/data/catalog";
import { ORDER_TAB_STATUSES, type OrderTab } from "@/lib/orders/status-groups";
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

/** ---- Product imagery, batched by slug -------------------------------------
 * Every screen in this module that shows a line item wants the same
 * picture the rest of the storefront shows for it — `ProductImage`
 * (`src/components/storefront/ProductImage.tsx`), which takes a `photo`
 * URL (or nothing) and a `swatchKey` to fall back to. Resolved here, once
 * per page of orders rather than once per line, because an order list page
 * showing twenty orders of four lines each is eighty products, not eighty
 * queries.
 */

interface ProductImageInfo {
  photo?: string;
  swatchKey: string;
}

/** What a line renders when its product cannot be found at all — a
    retired SKU is still a real purchase, and `OrderLine` keeps no FK to
    look it up by (see the model comment), so a miss here is expected, not
    a bug. Matches `Swatch`'s own fallback for an unrecognised key. */
const FALLBACK_IMAGE: ProductImageInfo = { swatchKey: "cement" };

/**
 * Batches the picture lookup for a set of product slugs.
 *
 * Deliberately does not reach for `PRODUCT_SWATCH_BY_CATEGORY`
 * (`src/lib/data/catalog.ts`) — that map is private to that module, and
 * this file keeping a second copy of it is exactly how the two drift the
 * day someone edits one and not the other. The category's own slug is
 * used as the swatch key instead: `Swatch` already falls back to `cement`
 * for any key it does not recognise (its own documented default), so an
 * order thumbnail either lands on the right motif — several category
 * slugs (`cement-steel`, `waterproofing`) coincide with a real swatch key
 * outright — or degrades exactly the way a product with no category does.
 * `resolvePhoto` (exported by `catalog.ts`) is reused as-is: it is the one
 * place that knows to gate `sourceImageUrl` behind `SHOW_SOURCE_IMAGES`,
 * and reimplementing that gate here would be the same drift risk again.
 */
async function resolveProductImages(slugs: string[]): Promise<Map<string, ProductImageInfo>> {
  if (slugs.length === 0) return new Map();

  const rows = await db.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      image: true,
      sourceImageUrl: true,
      category: { select: { slug: true } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.slug,
      {
        photo: resolvePhoto({ image: row.image, sourceImageUrl: row.sourceImageUrl }),
        swatchKey: row.category?.slug ?? "cement",
      },
    ]),
  );
}

function imageFor(images: Map<string, ProductImageInfo>, productSlug: string): ProductImageInfo {
  return images.get(productSlug) ?? FALLBACK_IMAGE;
}

/** `@db.Date` columns come back as midnight UTC — see `Order.expectedDeliveryOn`
    and `fromCalendarDate` (`src/lib/data/projects.ts`), whose exact technique
    this repeats. Not imported from there: it is one line, and importing a
    whole other domain's module for it is the more expensive coupling. */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ---- Summary (list) ------------------------------------------------------- */

export interface OrderLineThumbnail {
  productSlug: string;
  title: string;
  photo?: string;
  swatchKey: string;
}

export interface OrderSummary {
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  totalPaise: Paise;
  /** Count of distinct order lines, not total quantity — "3 items", not
      "14 units". */
  itemCount: number;
  /** The most recent payment attempt's status. Null for a callback order
      that has not been settled yet, or an online order abandoned before a
      gateway order was ever created — see `Payment`'s model comment. */
  paymentStatus: PaymentStatus | null;
  /** `YYYY-MM-DD`, or null when nobody at Quoin has committed to a date
      yet — see the model comment on `Order.expectedDeliveryOn`. Never
      computed from a lead time. */
  expectedDeliveryOn: string | null;
  /** When this order's `OrderStatusChange` history first recorded
      `DELIVERED`, for the one status where the order card shows a date
      that already happened rather than one still expected. Null for
      every order that has not reached it. */
  deliveredAt: Date | null;
  /** First four lines, enough to recognise the order at a glance without
      shipping every line to a list view — see `itemCount` for the true
      total. */
  thumbnails: OrderLineThumbnail[];
}

export interface OrderSummaryPage {
  items: OrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** First-page thumbnails only — a card shows at most four pictures plus a
    "+n" chip, so there is no reason to fetch a fifth. */
const MAX_SUMMARY_THUMBNAILS = 4;

/**
 * The signed-in customer's own orders, newest first, optionally narrowed
 * to one of the account area's tabs.
 *
 * Scoped by `userId` in the `where` clause with no way to override it —
 * there is no `?userId=` here for a caller to widen. `tab` reuses
 * `ORDER_TAB_STATUSES` (`src/lib/orders/status-groups.ts`) so this list,
 * the tab counts below and the account dashboard's own bucketing can never
 * disagree about which statuses a tab means.
 */
export async function listOrdersForUser(
  userId: string,
  page?: number,
  pageSize?: number,
  tab: OrderTab = "all",
): Promise<OrderSummaryPage> {
  const resolved = resolveOrderPage(page, pageSize);
  const where: Prisma.OrderWhereInput =
    tab === "all" ? { userId } : { userId, status: { in: [...ORDER_TAB_STATUSES[tab]] } };

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: resolved.skip,
      take: resolved.pageSize,
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        expectedDeliveryOn: true,
        _count: { select: { lines: true } },
        /* `OrderLine` has no position column — ordered by `id` instead.
           `cuid()` embeds a creation timestamp, so ascending id recovers
           the basket order `createPendingOrder` wrote the lines in
           closely enough to show "the first few things bought". */
        lines: {
          orderBy: { id: "asc" },
          take: MAX_SUMMARY_THUMBNAILS,
          select: { productSlug: true, title: true },
        },
        /* Grain is a checkout attempt, not the order — see `Payment`'s
           model comment — so the most recent row is where this order's
           payment currently stands. */
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
  ]);

  const slugs = [...new Set(rows.flatMap((row) => row.lines.map((line) => line.productSlug)))];
  const images = await resolveProductImages(slugs);

  /* One more batched query, not one per order: one row per order that has
     ever reached DELIVERED (it can only be reached once — see
     `ORDER_TRANSITIONS`, `src/lib/data/orders.ts` — so there is nothing to
     deduplicate here). */
  const orderIds = rows.map((row) => row.id);
  const deliveredAtByOrderId = new Map(
    orderIds.length === 0
      ? []
      : (
          await db.orderStatusChange.findMany({
            where: { orderId: { in: orderIds }, toStatus: "DELIVERED" },
            select: { orderId: true, createdAt: true },
          })
        ).map((change) => [change.orderId, change.createdAt] as const),
  );

  return {
    items: rows.map((row) => ({
      reference: row.reference,
      status: row.status,
      createdAt: row.createdAt,
      totalPaise: row.totalPaise,
      itemCount: row._count.lines,
      paymentStatus: row.payments[0]?.status ?? null,
      expectedDeliveryOn: row.expectedDeliveryOn ? dateOnly(row.expectedDeliveryOn) : null,
      deliveredAt: deliveredAtByOrderId.get(row.id) ?? null,
      thumbnails: row.lines.map((line) => ({
        productSlug: line.productSlug,
        title: line.title,
        ...imageFor(images, line.productSlug),
      })),
    })),
    page: resolved.page,
    pageSize: resolved.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / resolved.pageSize)),
  };
}

/**
 * How many of the customer's own orders fall into each tab.
 *
 * One `groupBy` on `status`, bucketed in memory against the same
 * `ORDER_TAB_STATUSES` table `listOrdersForUser` filters with — never a
 * separate `count()` per tab, which would be five round trips for numbers
 * that have to add up to one total anyway.
 */
export async function countOrdersByTab(userId: string): Promise<Record<OrderTab, number>> {
  const rows = await db.order.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  const byStatus = new Map(rows.map((row) => [row.status, row._count._all]));
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);

  const counts: Record<OrderTab, number> = {
    all: total,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };

  for (const tab of Object.keys(ORDER_TAB_STATUSES) as Exclude<OrderTab, "all">[]) {
    counts[tab] = ORDER_TAB_STATUSES[tab].reduce(
      (sum, status) => sum + (byStatus.get(status) ?? 0),
      0,
    );
  }

  return counts;
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
  photo?: string;
  swatchKey: string;
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

export interface OrderStatusHistoryEntry {
  toStatus: OrderStatus;
  /** ISO timestamp. */
  at: string;
}

export interface OrderDetail {
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  /** `YYYY-MM-DD`, or null — see `OrderSummary.expectedDeliveryOn`. */
  expectedDeliveryOn: string | null;
  /** Ascending — oldest first, matching how a timeline reads top to
      bottom. `src/lib/orders/timeline.ts` turns this into the customer-
      facing stepper; customers may see the status and the timestamp only,
      never `actor` or `note` — those stay on the admin projection
      (`AdminOrderStatusChangeDetail`, `src/lib/data/admin-orders.ts`). */
  statusHistory: OrderStatusHistoryEntry[];
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
      expectedDeliveryOn: true,
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
      /* Newest-last, ascending — see `OrderStatusHistoryEntry`. The admin
         projection (`getAdminOrder`) reads the same table newest-first;
         the two directions serve different readers and neither is wrong. */
      statusChanges: {
        orderBy: { createdAt: "asc" },
        select: { toStatus: true, createdAt: true },
      },
    },
  });

  if (!order) return null;

  const [payment] = order.payments;

  const images = await resolveProductImages([...new Set(order.lines.map((l) => l.productSlug))]);

  return {
    reference: order.reference,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    expectedDeliveryOn: order.expectedDeliveryOn ? dateOnly(order.expectedDeliveryOn) : null,
    statusHistory: order.statusChanges.map((change) => ({
      toStatus: change.toStatus,
      at: change.createdAt.toISOString(),
    })),
    lines: order.lines.map((line) => ({
      ...line,
      ...imageFor(images, line.productSlug),
    })),
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

/** ---- Project filing --------------------------------------------------------
 * "Filed under" on the order detail page — which of the customer's own
 * projects this order has been linked to, via `ProjectOrder`
 * (`src/lib/data/projects.ts` owns writing that link; this only reads it
 * back for the order screen).
 */

export interface OrderProjectLink {
  id: string;
  name: string;
}

/**
 * Scoped twice over: the join goes through `order: { reference, userId }`
 * *and* `project: { userId }`, so neither a guessed reference nor a
 * `ProjectOrder` row that somehow pointed at someone else's project could
 * surface a project this customer does not own.
 */
export async function getOrderProjectLinks(
  userId: string,
  reference: string,
): Promise<OrderProjectLink[]> {
  const links = await db.projectOrder.findMany({
    where: { order: { reference, userId }, project: { userId } },
    orderBy: { createdAt: "asc" },
    select: { project: { select: { id: true, name: true } } },
  });
  return links.map((link) => link.project);
}
