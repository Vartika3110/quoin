import { OrderStatus, Prisma } from "@prisma/client";
import type { Fulfilment, PaymentStatus, RefundStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAdminPage } from "@/lib/data/admin-metrics";
import { canTransition, IllegalOrderTransitionError } from "@/lib/data/orders";
import { releaseStockForOrder } from "@/lib/data/inventory";
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

/** A pathological search box entry cannot become an unbounded `contains` scan. */
const MAX_SEARCH_LENGTH = 64;

/** ---- List -------------------------------------------------------------- */

export interface AdminOrderRow {
  reference: string;
  customerName: string | null;
  customerPhone: string;
  status: OrderStatus;
  /** Null when nothing has been sent to the gateway yet — a fresh
      PENDING_PAYMENT order, or any callback order (see `paymentMode`,
      `src/lib/data/orders.ts`), never gets a `Payment` row at all. */
  paymentStatus: PaymentStatus | null;
  totalPaise: Paise;
  itemCount: number;
  createdAt: Date;
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
  /** Matches the order reference or the customer's account phone. */
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

  const where: Prisma.OrderWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { user: { phone: { contains: q } } },
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
        totalPaise: true,
        user: { select: { name: true, phone: true } },
        _count: { select: { lines: true } },
        /* Grain is a checkout attempt, not the order — see `Payment`'s
           model comment — so the most recent row is "where this order's
           payment currently stands", same as the customer's own
           order-history read. */
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      reference: row.reference,
      customerName: row.user.name,
      customerPhone: row.user.phone,
      status: row.status,
      paymentStatus: row.payments[0]?.status ?? null,
      totalPaise: row.totalPaise,
      itemCount: row._count.lines,
      createdAt: row.createdAt,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
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
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: Paise;
  status: PaymentStatus;
  method: string | null;
  failureReason: string | null;
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
  customer: { id: string; name: string | null; phone: string };
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
      user: { select: { id: true, name: true, phone: true } },
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
          providerOrderId: true,
          providerPaymentId: true,
          amountPaise: true,
          status: true,
          method: true,
          failureReason: true,
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
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      amountPaise: payment.amountPaise,
      status: payment.status,
      method: payment.method,
      failureReason: payment.failureReason,
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
 * Thrown when this endpoint is asked to set `PAID` by hand.
 *
 * `PENDING_PAYMENT -> PAID` is a legal edge in `canTransition`'s own
 * table — the lifecycle machine has no opinion on *who* may cross it, only
 * on *whether* the states connect. That authority is narrower than the
 * machine: only `settleCapturedPayment` (`src/lib/data/orders.ts`), acting
 * on a signature-verified `payment.captured` webhook, may assert that
 * money actually moved. A staff click is not proof of payment, so this is
 * checked before `canTransition` is even consulted — the machine being
 * asked the right question does not matter if the asker has no standing
 * to ask it.
 */
export class PaidNotAdminSettableError extends Error {
  constructor() {
    super(
      "PAID can only be set automatically, when the Razorpay webhook confirms a captured payment. It cannot be set by hand.",
    );
    this.name = "PaidNotAdminSettableError";
  }
}

/** Another request already moved this order between the read and the write. */
export class OrderStatusRaceError extends Error {
  constructor() {
    super("This order's status changed before this update could be applied. Reload and try again.");
    this.name = "OrderStatusRaceError";
  }
}

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
  return to !== "PAID" && canTransition(from, to);
}

/** Every status this endpoint could move `from` into right now. */
export function legalNextStatuses(from: OrderStatus): OrderStatus[] {
  return ALL_ORDER_STATUSES.filter((to) => isAdminTransitionAllowed(from, to));
}

export interface TransitionOrderStatusInput {
  reference: string;
  toStatus: OrderStatus;
  /** The staff account making the change. Never nullable from this
      caller — there is always a `requireStaff()` behind this endpoint —
      but the column itself is nullable, see `OrderStatusChange`. */
  actorUserId: string;
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
