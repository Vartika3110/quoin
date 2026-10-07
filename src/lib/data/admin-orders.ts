import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import type { Fulfilment, PaymentProvider, RefundStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAdminPage } from "@/lib/data/admin-metrics";
import { canTransition, IllegalOrderTransitionError, OrderStatusRaceError } from "@/lib/data/orders";
import { releaseStockForOrder } from "@/lib/data/inventory";
import { isRetiredStatus } from "@/lib/orders/lifecycle";
import { summariseWhatsApp, type OrderWhatsAppSummary } from "@/lib/data/whatsapp-notifications";
import type { Paise } from "@/lib/types/catalog";

/**
 * Admin order queue — the read and write side of staff order handling.
 *
 * `src/lib/data/orders.ts` writes an order into existence and settles its
 * payment; `src/lib/data/order-history.ts` reads it back for the customer
 * who placed it. Neither answers "what should the person on the phone
 * with a customer see", and neither should ever be asked to write a
 * status change on a person's say-so — the whole point of this module is
 * that boundary. `canTransition` and `IllegalOrderTransitionError` are
 * imported, not reimplemented: the lifecycle table lives in one place.
 */

/** ---- Filtering ------------------------------------------------------- */

const ORDER_STATUS_VALUES: ReadonlySet<string> = new Set(Object.values(OrderStatus));

/**
 * Turns a raw `?status=` query value into a real `OrderStatus`, or
 * `undefined` for anything that is not one — including absent, empty, or
 * hand-edited garbage. A stale filter link should show the unfiltered
 * queue rather than 400, matching how this app already treats a bad
 * `?sort=` or `?page=` (`GET /api/v1/products`).
 */
export function parseOrderStatusFilter(value: string | undefined): OrderStatus | undefined {
  if (value && ORDER_STATUS_VALUES.has(value)) return value as OrderStatus;
  return undefined;
}

const PAYMENT_STATUS_VALUES: ReadonlySet<string> = new Set(Object.values(PaymentStatus));

/** The same forgiving parse, for `?payment=`. */
export function parsePaymentStatusFilter(value: string | undefined): PaymentStatus | undefined {
  if (value && PAYMENT_STATUS_VALUES.has(value)) return value as PaymentStatus;
  return undefined;
}

/**
 * Turns a `?from=`/`?to=` date input (`YYYY-MM-DD`, what `<input
 * type="date">` submits) into a UTC instant on the IST calendar day it
 * names.
 *
 * `edge: "start"` is midnight IST that morning; `edge: "end"` is midnight
 * IST the *next* morning, so a `to` of today includes everything placed
 * today — an exclusive upper bound built from an inclusive-looking input,
 * which is the only reading a person filling in "to: 7 Oct" means.
 *
 * IST has had no DST since 1947, so a fixed `+05:30` literal is correct
 * for every day this app will query — the same reasoning
 * `resolveIstDayRangeUtc` (`src/lib/data/admin-metrics.ts`) records.
 * Anything that is not a well-formed date returns `undefined`, so a
 * stale or hand-edited filter link shows the unfiltered queue rather
 * than 400 — exactly as `parseOrderStatusFilter` does.
 */
export function parseIstDateFilter(
  value: string | undefined,
  edge: "start" | "end",
): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const midnight = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(midnight.getTime())) return undefined;
  return edge === "start" ? midnight : new Date(midnight.getTime() + 24 * 60 * 60 * 1000);
}

/** A pathological search box entry cannot become an unbounded `contains` scan. */
const MAX_SEARCH_LENGTH = 64;

/** ---- List -------------------------------------------------------------- */

export interface AdminOrderRow {
  reference: string;
  customerName: string | null;
  /** Null for a Google account that has never given checkout a number. */
  customerPhone: string | null;
  customerEmail: string | null;
  status: OrderStatus;
  /** Null when nothing has been sent to the gateway yet — a fresh
      PENDING_PAYMENT order, or any callback order (see `paymentMode`,
      `src/lib/data/orders.ts`), never gets a `Payment` row at all. */
  paymentStatus: PaymentStatus | null;
  totalPaise: Paise;
  itemCount: number;
  createdAt: Date;
  /** When the row last changed, which for an order is always its last
      status change — see the note on `getOrderBoard`
      (`src/lib/data/admin-board.ts`) for why `updatedAt` is a safe
      stand-in for that rather than a join over `OrderStatusChange`. */
  updatedAt: Date;
  /**
   * The stores this order has to be picked from, snapshotted names.
   *
   * An array, not a string, because an order can span stores and the
   * column has to be able to say so. Empty for an order that reserved no
   * stock anywhere — a callback, a made-to-order basket — which is not a
   * missing vendor but the honest answer that Quoin fulfils it itself.
   */
  vendorNames: string[];
  /** Whether every leg has been dispatched, for the vendor column's
      "1 of 2 dispatched" line. */
  vendorsDispatched: number;
  /** The worst state among this order's WhatsApp messages, so a staff
      member can spot a messaging problem without opening the order. */
  whatsapp: OrderWhatsAppSummary;
}

export interface AdminOrderListPage {
  items: AdminOrderRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminOrderListParams {
  status?: OrderStatus;
  /** Matched against the *latest* payment attempt — see the note in the
      query below on why that is the only reading that makes sense. */
  paymentStatus?: PaymentStatus;
  /** A `Store.id`: only orders with a leg at that store. */
  storeId?: string;
  /** Inclusive lower bound on `createdAt`, from `parseIstDateFilter`. */
  from?: Date;
  /** Exclusive upper bound on `createdAt` — midnight IST after the day
      the filter names, so "to: today" includes today. */
  to?: Date;
  /** Matches the order reference, the customer's name, or their phone. */
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The order queue, newest first.
 *
 * `status` alone hits `@@index([status, createdAt])` directly. A search
 * additionally filters in memory-free SQL on `reference` (unique, so an
 * exact or prefix match is already cheap) or the customer's own phone via
 * the `User` relation — there is no per-order phone column to index
 * separately, and `User.phone` already carries a unique index of its own.
 * With neither filter this is a plain `@@index([status, createdAt])` scan
 * ignoring the leading column, no worse than the unfiltered dashboard
 * queries already reading this table.
 */
export async function listAdminOrders(params: AdminOrderListParams): Promise<AdminOrderListPage> {
  const { page, pageSize, skip } = resolveAdminPage(params.page, params.pageSize);
  const q = params.q?.trim().slice(0, MAX_SEARCH_LENGTH) || undefined;

  const createdAt =
    params.from || params.to
      ? {
          ...(params.from ? { gte: params.from } : {}),
          ...(params.to ? { lt: params.to } : {}),
        }
      : undefined;

  const where: Prisma.OrderWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(createdAt ? { createdAt } : {}),
    /* `some`, on the relation, rather than a join to the latest row:
       "show me the orders with a captured payment" is the question
       staff are actually asking, and an order whose first attempt
       failed and whose second succeeded should appear under both
       filters because both happened. The *column* still shows the
       latest attempt, which is where that order currently stands. */
    ...(params.paymentStatus ? { payments: { some: { status: params.paymentStatus } } } : {}),
    /* The vendor filter goes through the fulfilment rows rather than
       `OrderLine.storeId`, deliberately: a fulfilment exists only once
       the order is actually paid for, so filtering by vendor cannot
       surface an abandoned checkout nobody was ever asked to pick. */
    ...(params.storeId ? { fulfilments: { some: { storeId: params.storeId } } } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { phone: { contains: q } } },
            /* The shipping name too, which is often the only name on a
               Google account that never filled a profile in. */
            { shipName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        reference: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        totalPaise: true,
        user: { select: { name: true, phone: true, email: true } },
        _count: { select: { lines: true } },
        /* Grain is a checkout attempt, not the order — see `Payment`'s
           model comment — so the most recent row is "where this order's
           payment currently stands", same as the customer's own
           order-history read. */
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        /* Two small relation reads per page of twenty rows, both over
           indexes on `orderId`. Done here rather than as two more
           queries because the alternative — a second pass keyed by order
           id — is the same work with an extra round-trip, and these
           columns are the point of the upgraded queue. */
        fulfilments: { orderBy: { createdAt: "asc" }, select: { storeName: true, status: true } },
        whatsappNotifications: { select: { status: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      reference: row.reference,
      customerName: row.user.name,
      customerPhone: row.user.phone,
      customerEmail: row.user.email,
      status: row.status,
      paymentStatus: row.payments[0]?.status ?? null,
      totalPaise: row.totalPaise,
      itemCount: row._count.lines,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      vendorNames: row.fulfilments.map((fulfilment) => fulfilment.storeName),
      vendorsDispatched: row.fulfilments.filter((f) => f.status === "DISPATCHED").length,
      whatsapp: summariseWhatsApp(row.whatsappNotifications.map((n) => n.status)),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * The stores the vendor filter can offer.
 *
 * Every store, not only the ones with a WhatsApp number: a store that
 * fulfils orders and has no number yet is exactly the one staff most need
 * to filter to, because its vendor notifications are the ones failing.
 * Inactive stores are included too — they still appear on past orders,
 * and a filter that cannot reach them cannot answer a question about
 * them.
 */
export async function listVendorOptions(): Promise<{ id: string; name: string }[]> {
  const stores = await db.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, isActive: true },
  });
  return stores.map((store) => ({
    id: store.id,
    name: `${store.name}${store.isActive ? "" : " (inactive)"}`,
  }));
}

/**
 * Plain-language label for a frozen line's fulfilment. A `Record` over
 * the enum, not a `switch` with a default — adding a fifth fulfilment
 * type without adding it here is a type error, not a blank cell on an
 * order a phone call is being made about.
 */
export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  INSTANT: "Instant",
  SCHEDULED: "Scheduled delivery",
  BOOKABLE: "Booked visit",
  MADE_TO_ORDER: "Made to order",
};

/** No refund route exists yet to set any of these from — see
    `docs/production-audit.md` NEEDS WORK 6 — but the model is real and a
    row can already exist from a manual database write, so the order
    detail page needs a label for whatever it finds. */
export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "Refund pending",
  PROCESSED: "Refunded",
  FAILED: "Refund failed",
};

/** ---- Detail -------------------------------------------------------------- */

export interface AdminOrderLineDetail {
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
  fulfilment: Fulfilment;
}

export interface AdminOrderRefundDetail {
  id: string;
  providerRefundId: string | null;
  amountPaise: Paise;
  status: RefundStatus;
  reason: string | null;
  createdAt: Date;
}

export interface AdminOrderPaymentDetail {
  id: string;
  provider: PaymentProvider;
  /** Razorpay's own order id. Null for an `OFFLINE` row — see the model
      comment on `Payment.providerOrderId`. */
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountPaise: Paise;
  status: PaymentStatus;
  /** `upi`/`card`/… from the gateway for a RAZORPAY row, or the staff-
      picked `UPI`/`CASH`/`BANK_TRANSFER`/`CHEQUE` for an OFFLINE one. */
  method: string | null;
  failureReason: string | null;
  /** A UPI transaction id, bank reference or receipt number staff typed
      in. Always null for a RAZORPAY row. */
  offlineReference: string | null;
  /** Who recorded an OFFLINE payment — name, else phone, else null for a
      RAZORPAY row (nobody "records" a webhook). */
  recordedByName: string | null;
  recordedByPhone: string | null;
  createdAt: Date;
  refunds: AdminOrderRefundDetail[];
}

export interface AdminOrderStatusChangeDetail {
  id: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  /** Null for an automated transition attributed to nobody — see the
      model comment on `OrderStatusChange`. Nothing writes that today;
      the column exists for the caller that eventually will. */
  actorName: string | null;
  actorPhone: string | null;
  note: string | null;
  createdAt: Date;
}

export interface AdminOrderDetail {
  id: string;
  reference: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  customer: { id: string; name: string | null; phone: string | null; email: string | null };
  lines: AdminOrderLineDetail[];
  /** GST-inclusive throughout — `taxPaise` is a component already inside
      `subtotalPaise`, never an amount added on top of it. See
      `taxForLine`, `src/lib/data/orders.ts`. */
  subtotalPaise: Paise;
  taxPaise: Paise;
  discountPaise: Paise;
  deliveryFeePaise: Paise;
  totalPaise: Paise;
  currency: string;
  shipping: {
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  payments: AdminOrderPaymentDetail[];
  statusChanges: AdminOrderStatusChangeDetail[];
}

/**
 * One order, in full, for the person fulfilling or explaining it — every
 * payment attempt (not only the latest, unlike the list row above), every
 * refund against those attempts, and the full status audit trail.
 *
 * Not scoped to a `userId` the way `getOrderForUser` is: this is staff
 * tooling, and any member of staff may look up any order by its
 * reference. There is no equivalent of the customer-facing "does this
 * reference belong to whoever is asking" check to make here.
 */
export async function getAdminOrder(reference: string): Promise<AdminOrderDetail | null> {
  const order = await db.order.findUnique({
    where: { reference },
    select: {
      id: true,
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
      user: { select: { id: true, name: true, phone: true, email: true } },
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
          fulfilment: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          provider: true,
          providerOrderId: true,
          providerPaymentId: true,
          amountPaise: true,
          status: true,
          method: true,
          failureReason: true,
          offlineReference: true,
          recordedBy: { select: { name: true, phone: true } },
          createdAt: true,
          refunds: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              providerRefundId: true,
              amountPaise: true,
              status: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      },
      statusChanges: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
          actor: { select: { name: true, phone: true } },
        },
      },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    customer: order.user,
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
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      amountPaise: payment.amountPaise,
      status: payment.status,
      method: payment.method,
      failureReason: payment.failureReason,
      offlineReference: payment.offlineReference,
      recordedByName: payment.recordedBy?.name ?? null,
      recordedByPhone: payment.recordedBy?.phone ?? null,
      createdAt: payment.createdAt,
      refunds: payment.refunds,
    })),
    statusChanges: order.statusChanges.map((change) => ({
      id: change.id,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      actorName: change.actor?.name ?? null,
      actorPhone: change.actor?.phone ?? null,
      note: change.note,
      createdAt: change.createdAt,
    })),
  };
}

/** ---- Status transitions --------------------------------------------------- */

/** No order matches the reference this was asked to move. */
export class OrderNotFoundError extends Error {
  constructor(reference: string) {
    super(`No such order: ${reference}`);
    this.name = "OrderNotFoundError";
  }
}

/**
 * Thrown when this endpoint — the generic status mover — is asked to set
 * `PAID` by hand.
 *
 * `PENDING_PAYMENT -> PAID` is a legal edge in `canTransition`'s own
 * table — the lifecycle machine has no opinion on *who* may cross it, only
 * on *whether* the states connect. That authority is narrower than the
 * machine, and this endpoint has none of it: `PAID` is reachable exactly
 * two ways, both in `src/lib/data/orders.ts` and neither this one —
 * `settleCapturedPayment`, acting on a signature-verified Razorpay
 * `payment.captured` webhook, or `recordOfflinePayment`, the dedicated
 * staff action (`POST .../offline-payment`) that writes a `CAPTURED`
 * `OFFLINE` `Payment` row with an actor, a method and a reference before
 * it moves the order. A bare `toStatus: "PAID"` on *this* endpoint proves
 * none of that — it is not "the wrong form of proof", it is no proof at
 * all — so it is refused before `canTransition` is even consulted: the
 * machine being asked the right question does not matter if the asker has
 * no standing to ask it.
 */
export class PaidNotAdminSettableError extends Error {
  constructor() {
    super(
      "PAID cannot be set here. It is set automatically when the Razorpay webhook confirms a captured payment, or by staff through \"Mark payment received\" on the order page.",
    );
    this.name = "PaidNotAdminSettableError";
  }
}

/** Another request already moved this order between the read and the write.
    Defined in `src/lib/data/orders.ts` — `recordOfflinePayment` needs to
    throw the same error, and re-exported here so nothing importing it from
    this module has to change. */
export { OrderStatusRaceError } from "@/lib/data/orders";

const ALL_ORDER_STATUSES = Object.values(OrderStatus) as OrderStatus[];

/**
 * Whether this admin endpoint — as opposed to the lifecycle machine in
 * the abstract — may move an order from `from` to `to` at all.
 *
 * `canTransition`'s table has no concept of *who* is asking, only whether
 * the two states connect; this narrows it by the one rule that is about
 * the asker, not the machine — see `PaidNotAdminSettableError`. Pure and
 * exported so the status form on the order detail page can compute which
 * buttons to show from the same rule `transitionOrderStatus` enforces,
 * rather than a second, hand-maintained list of "the ones that aren't
 * PAID" drifting from it.
 */
export function isAdminTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  if (to === "PAID") return false;
  /* The second rule that is about the asker rather than the machine.
     `CONFIRMED`, `PROCESSING` and `PACKED` are retired — the simplified
     lifecycle has no accept, prepare or ready step (see
     `src/lib/orders/lifecycle.ts`) — so nothing may move an order *into*
     one of them any more. Their edges stay in `ORDER_TRANSITIONS` so an
     order already sitting in one can be moved forward; this is what
     stops a new one arriving there. Read from
     `RETIRED_FULFILMENT_STATUSES` rather than named here, so the retired
     list has one home. */
  if (isRetiredStatus(to)) return false;
  return canTransition(from, to);
}

/** Every status this endpoint could move `from` into right now. */
export function legalNextStatuses(from: OrderStatus): OrderStatus[] {
  return ALL_ORDER_STATUSES.filter((to) => isAdminTransitionAllowed(from, to));
}

export interface TransitionOrderStatusInput {
  reference: string;
  toStatus: OrderStatus;
  /**
   * Who is making the change.
   *
   * A staff account's id from the admin route, where `requireStaff()` has
   * already run — or **null**, which is not "unknown" but a specific,
   * meaningful answer: no account was involved. That is the case when a
   * vendor dispatches their own leg through the link in their WhatsApp
   * (`dispatchOrderLeg`, src/lib/data/order-dispatch.ts) and the last
   * outstanding leg rolls the order up to DISPATCHED. There is no vendor
   * account system in this app, so attributing that move to a staff
   * member who did not make it would put a fiction in the audit trail —
   * which is precisely the nullability `OrderStatusChange.actorUserId`
   * was given, and says so in its own model comment. The `note` carries
   * which store it was.
   */
  actorUserId: string | null;
  note?: string;
}

/**
 * Moves an order to a new status, on staff's own authority.
 *
 * The write and its audit row are one transaction: either both land or
 * neither does, because a status that changed with no record of who
 * changed it is exactly the gap `OrderStatusChange` exists to close.
 *
 * Guarded the same way `settleCapturedPayment` guards a payment
 * settlement: `from` is read once, `canTransition` is checked against
 * that read, and the write itself is a conditional `updateMany` re-
 * asserting the very same `from` — never a plain `update` by id. Two
 * staff opening the same order and both clicking a transition see the
 * same starting state and both pass the legality check; only one of
 * them can win the guarded write, and the other gets
 * `OrderStatusRaceError` rather than silently overwriting what the
 * winner just wrote or double-applying a transition the state machine
 * only allows once.
 */
export async function transitionOrderStatus(
  input: TransitionOrderStatusInput,
): Promise<AdminOrderDetail> {
  if (input.toStatus === "PAID") {
    throw new PaidNotAdminSettableError();
  }

  const existing = await db.order.findUnique({
    where: { reference: input.reference },
    select: { id: true, status: true },
  });
  if (!existing) throw new OrderNotFoundError(input.reference);

  const from = existing.status;
  if (!canTransition(from, input.toStatus)) {
    throw new IllegalOrderTransitionError(from, input.toStatus);
  }

  await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: existing.id, status: from },
      data: { status: input.toStatus },
    });

    if (claimed.count === 0) throw new OrderStatusRaceError();

    if (input.toStatus === "CANCELLED" && (from === "PENDING_PAYMENT" || from === "FAILED")) {
      /* Only these two `from` states can still be holding a live
         *reservation*. `settleCapturedPayment` converts a reservation into
         a permanent commit the moment an order reaches PAID —
         `commitStockForOrder` moves `onHandQty` and `reservedQty`
         together, see `movementDelta`'s `COMMIT` case — so a PAID,
         CONFIRMED or PROCESSING order being cancelled has nothing of its
         own left in `reservedQty` to give back. Calling
         `releaseStockForOrder` there anyway would not be a safe no-op:
         `OrderLine.storeId` stays frozen on the row long after the stock
         itself was committed, so the guarded release in
         `releaseVariantStock` would still find a matching
         `InventoryItem` — and if some *other* order is holding a live
         reservation on that same variant and store right now, it would
         happily subtract against that instead, silently taking back a
         different customer's still-live reservation to satisfy this
         cancellation. Giving already-committed stock back to sale is a
         return — `returnStock` exists for exactly that — and is a
         separate, unbuilt workflow this endpoint does not attempt.

         A callback order (no stock-bearing line ever reserved) and an
         untracked product (same) both have no `OrderLine.storeId` set at
         all, so `releaseStockForOrder`'s own query matches nothing for
         them — not an error, just nothing to do. */
      await releaseStockForOrder(tx, existing.id);
      await tx.order.update({
        where: { id: existing.id },
        data: { reservationExpiresAt: null },
      });
    }

    await tx.orderStatusChange.create({
      data: {
        orderId: existing.id,
        fromStatus: from,
        toStatus: input.toStatus,
        actorUserId: input.actorUserId,
        note: input.note?.trim() || null,
      },
    });
  });

  const updated = await getAdminOrder(input.reference);
  /* Cannot actually miss: the transaction above just wrote this exact
     row inside the same request that is about to re-read it. */
  if (!updated) throw new Error("Order vanished immediately after its own status update");
  return updated;
}
