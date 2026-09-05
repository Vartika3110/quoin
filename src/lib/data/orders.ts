import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";
import { quoteCart, type Quote } from "@/lib/data/checkout";
import {
  InsufficientStockError,
  RESERVATION_WINDOW_MS,
  StoreUnavailableError,
  commitStockForOrder,
  reserveStockForOrder,
  type OrderStockLine,
} from "@/lib/data/inventory";
import type { Paise } from "@/lib/types/catalog";

/**
 * Orders.
 *
 * The one module in this app that writes something a customer can lose
 * money over, so two rules run through all of it:
 *
 * **The browser never states an amount.** It sends slugs, variant ids and
 * quantities — the same shape `/checkout/quote` takes — and every rupee
 * is recomputed here by `quoteCart` against the live catalogue at the
 * moment the order is written. A request claiming a total is not
 * validated against the catalogue; the total it claims is discarded.
 *
 * **Nothing here is derived at read time.** Prices, names, tax rates and
 * the delivery address are all copied onto the order. The catalogue is
 * re-importable and editable by staff, and an invoice that restates
 * itself when a price is corrected next quarter is not an invoice.
 */

const REFERENCE_PREFIX = "QO";

/**
 * How long a **callback** order holds its reservation before
 * `releaseExpiredReservations` gives it back.
 *
 * `RESERVATION_WINDOW_MS` (15 minutes, from `inventory.ts`) assumes a
 * customer sitting at a payment screen, paying within minutes. A callback
 * order has no one at a payment screen at all — the confirmation page's
 * promise is "an expert calls back within the hour", and the reservation
 * has to survive the whole of that: a queue before the call is made,
 * actually reaching the customer, reading the order back to them, and
 * taking payment over the phone. A reservation that lapses at minute 16
 * while the expert is still dialling is worse than never reserving —
 * the customer has already been told the stock is theirs.
 *
 * Three hours: comfortably past the one-hour promise, so a busy call
 * queue does not silently cost the reservation, while still expiring
 * same-day rather than holding stock indefinitely for a call nobody
 * answers. Not an environment variable — this is a product promise
 * ("within the hour"), not a deploy-time tuning knob, and nobody would
 * ever set it differently per environment.
 */
export const CALLBACK_RESERVATION_WINDOW_MS = 3 * 60 * 60 * 1000;

/** ---- Tax ---------------------------------------------------------------- */

/**
 * GST is **extracted from** the line, not added on top of it.
 *
 * Both catalogue importers write a tax-inclusive figure into `pricePaise`
 * — `prisma/import-brand-catalogue.ts` writes the manufacturer MRP, and
 * `prisma/import-catalogue.ts` writes the scraped competitor retail price,
 * and an Indian MRP or retail price is inclusive of GST by law. That is a
 * fact about where the number in the database came from, not a choice
 * this function makes: every `pricePaise` already contains its tax, so
 * the only correct move is to back the tax back out of it. A ₹1,000 tap
 * on the 18% slab stays ₹1,000 on the product page and at checkout; ₹153
 * of that ₹1,000 is shown as GST, it is not charged in addition to it.
 *
 * Rounded half-up to the paise, per line rather than on the subtotal,
 * because a mixed basket spans four GST slabs and there is no single rate
 * that could be applied to a total — and per-line is also what a GST
 * invoice has to show: the rate and the tax against each line, not one
 * blended figure for the basket.
 */
export function taxForLine(linePaise: Paise, gstRatePct: number): Paise {
  return Math.round((linePaise * gstRatePct) / (100 + gstRatePct));
}

/** ---- Lifecycle ------------------------------------------------------------ */

/**
 * Thrown by a future caller — an admin tool, not this module — when it has
 * already decided to move an order and `canTransition` said no. Carries
 * both ends of the attempted move so the caller does not have to
 * re-derive them for the error it shows a person.
 */
export class IllegalOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Cannot move an order from ${from} to ${to}`);
    this.name = "IllegalOrderTransitionError";
  }
}

/**
 * The order lifecycle, as a table rather than scattered `if`s.
 *
 * Payment states (`PENDING_PAYMENT`, `PAID`, `FAILED`) and fulfilment
 * states (`CONFIRMED` through `DELIVERED`) share one table because a
 * refund can be requested from almost any of them — `REFUND_PENDING` is
 * reachable from `PAID` onward, including before a human has looked at
 * the order at all. `CANCELLED` and `REFUNDED` have no outgoing edges:
 * money that has been given back, or an order that never happened, has
 * nowhere further to go.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "FAILED", "CANCELLED"],
  FAILED: ["PENDING_PAYMENT", "CANCELLED"],
  PAID: ["CONFIRMED", "CANCELLED", "REFUND_PENDING"],
  CONFIRMED: ["PROCESSING", "CANCELLED", "REFUND_PENDING"],
  PROCESSING: ["PACKED", "CANCELLED", "REFUND_PENDING"],
  PACKED: ["DISPATCHED", "REFUND_PENDING"],
  DISPATCHED: ["OUT_FOR_DELIVERY", "REFUND_PENDING"],
  OUT_FOR_DELIVERY: ["DELIVERED", "REFUND_PENDING"],
  DELIVERED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Whether the lifecycle allows moving an order from `from` to `to`.
 *
 * Pure and side-effect free: this is the guard a future admin route calls
 * before writing a status, not a place that writes one itself — there is
 * no such route yet, because everything past `PAID` is a person in a tool
 * that does not exist. `PAID` is just another edge in this table; the
 * rule that only the webhook may set it lives in which functions are
 * exposed to call `db.order.update` with it, not in here.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** ---- Writes ------------------------------------------------------------- */

export interface OrderLineInput {
  productSlug: string;
  variantId: string;
  qty: number;
}

export interface CreateOrderInput {
  userId: string;
  isPro: boolean;
  lines: OrderLineInput[];
  /** Must belong to `userId` — the caller is responsible for proving it. */
  addressId: string;
  /** Who takes delivery. Defaults to the account's own name and phone. */
  shipName: string;
  shipPhone: string;
  /**
   * Client-supplied, scoped to this user by `Order`'s unique index. A
   * repeat of the same key returns the order already written for it
   * instead of writing a second one — see `readIdempotentOrder` below.
   * Absent means "no retry protection requested", which is a valid,
   * ordinary case and not an error.
   */
  idempotencyKey?: string;
  /**
   * Decided by the customer on the payment step, not inferred here from
   * whether Razorpay is configured — `CheckoutFlow` offers "Confirm with
   * an expert" even when online payment is also available, so this
   * cannot be derived from `isRazorpayConfigured()` alone. The only thing
   * it changes in this function is which reservation window a stock-
   * bearing line is held under, see `CALLBACK_RESERVATION_WINDOW_MS`.
   * Whether a gateway order gets created at all is decided by the route,
   * after this function returns — it is not this function's concern.
   */
  paymentMode: "online" | "callback";
}

export interface CreatedOrder {
  id: string;
  reference: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  /** The re-priced basket, so the caller can show what moved. */
  quote: Quote;
  /**
   * True when `idempotencyKey` matched an order already written for this
   * user and nothing new was created. A caller that already sent this
   * order to the gateway should not do so again — see `existingPayment`.
   */
  idempotent: boolean;
  /**
   * The most recent payment attempt already on this order. Only ever set
   * when `idempotent` is true: a freshly created order cannot have one
   * yet. Null covers two different reasons now: a **callback** order,
   * which never gets a `Payment` row at all — see `paymentMode` — and an
   * **online** order whose first attempt crashed between the order being
   * written and the gateway being called. The route tells these apart by
   * the `paymentMode` it was asked for, not by this field; for "online"
   * it means proceed to create a gateway order against this same order,
   * exactly as for a brand new one.
   */
  existingPayment: { providerOrderId: string; amountPaise: Paise } | null;
}

/**
 * Thrown when the basket cannot become an order at all.
 *
 * Distinct from a quote that merely *changed*: a changed quote is shown
 * to the customer and they continue or do not, whereas an empty or
 * entirely unavailable basket has nothing to charge for.
 */
export class OrderNotPossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotPossibleError";
  }
}

/**
 * Re-reads the order a repeated idempotency key refers to.
 *
 * Called only after `db.order.create` has already failed on the
 * `(userId, idempotencyKey)` unique index — the index is what decided
 * this is a duplicate, not this read, which is why the write is
 * attempted first rather than this being a `findFirst` guard in front of
 * it. Two concurrent requests carrying the same key both attempt the
 * insert; exactly one wins it, and the other lands here to read what the
 * winner wrote.
 */
async function readIdempotentOrder(
  userId: string,
  idempotencyKey: string,
  quote: Quote,
): Promise<CreatedOrder> {
  const existing = await db.order.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    select: {
      id: true,
      reference: true,
      subtotalPaise: true,
      taxPaise: true,
      totalPaise: true,
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { providerOrderId: true, amountPaise: true },
      },
    },
  });

  /* The unique index just rejected an insert on this exact key, so the
     row it collided with must be readable back in the same database. A
     miss here is not a race to handle — it is a bug. */
  if (!existing) {
    throw new Error(
      "Idempotency key collided on insert but the row it collided with could not be re-read",
    );
  }

  const [payment] = existing.payments;

  return {
    id: existing.id,
    reference: existing.reference,
    subtotalPaise: existing.subtotalPaise,
    taxPaise: existing.taxPaise,
    totalPaise: existing.totalPaise,
    quote,
    idempotent: true,
    existingPayment: payment
      ? { providerOrderId: payment.providerOrderId, amountPaise: payment.amountPaise }
      : null,
  };
}

/**
 * Writes a PENDING_PAYMENT order and its frozen lines.
 *
 * Returns before any gateway is involved. The order existing with no
 * payment against it is the normal resting state of an abandoned
 * checkout, and it is also the only record that the attempt happened —
 * which is why the row is written first and the gateway called second,
 * rather than the other way around.
 *
 * The whole write is one transaction: an order without its lines is a
 * charge with nothing to say what was bought.
 */
export async function createPendingOrder(
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  const quote = await quoteCart(input.lines, input.isPro);

  if (quote.lines.length === 0) {
    throw new OrderNotPossibleError(
      "Nothing in this basket can be ordered right now.",
    );
  }

  /* The address is re-read here rather than trusted from the caller's
     session, and scoped to the user: an address id belonging to someone
     else must not be usable as a delivery target, and it is the kind of
     id that is trivially guessed at if it is ever exposed. */
  const address = await db.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
    select: {
      id: true,
      line1: true,
      line2: true,
      landmark: true,
      city: true,
      state: true,
      pincode: true,
      /* Serviceability — and so which store a tracked line reserves
         against — is decided by coordinates, never by pincode. Same rule
         `src/lib/geo.ts` applies to the storefront's own delivery promise. */
      lat: true,
      lng: true,
    },
  });

  if (!address) {
    throw new OrderNotPossibleError("That delivery address is not available.");
  }

  /* The GST slab lives on the product, and the quote does not carry it —
     it is a pricing function, and tax is an invoicing concern. One query
     for every product in the basket rather than one per line. */
  const slugs = [...new Set(quote.lines.map((l) => l.productSlug))];
  const products = await db.product.findMany({
    where: { slug: { in: slugs } },
    /* `fulfilment` is read back here rather than taken from the quote:
       the quote widens it to a string for the client, and casting that
       back to the enum on the way into the database would accept any
       string at all. Same row as the tax slab, no extra query. */
    select: {
      slug: true,
      sku: true,
      gstRatePct: true,
      fulfilment: true,
      stockTracked: true,
    },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const lines = quote.lines.map((line) => {
    const product = bySlug.get(line.productSlug);

    /* `quoteCart` just priced this line off a live, active product, so a
       miss here means the row went away between two queries in the same
       request. Rare, and not something to paper over with a default rate:
       an invented tax rate on a real invoice is a compliance problem. */
    if (!product) {
      throw new OrderNotPossibleError(
        "The catalogue changed while this order was being placed. Please try again.",
      );
    }

    return {
      productSlug: line.productSlug,
      variantId: line.variantId,
      sku: product.sku,
      title: line.title,
      variantLabel: line.variantLabel,
      qty: line.qty,
      unitPricePaise: line.unitPricePaise,
      mrpPaise: line.mrpPaise,
      linePaise: line.linePaise,
      gstRatePct: product.gstRatePct,
      taxPaise: taxForLine(line.linePaise, product.gstRatePct),
      fulfilment: product.fulfilment,
    };
  });

  /* What `reserveStockForOrder` needs to decide which lines to touch at
     all — kept separate from `lines` above rather than added onto it,
     because `lines` is written verbatim into `OrderLine.createMany` and
     that table has no `stockTracked` column to reject the extra field. */
  const stockCheckLines: OrderStockLine[] = lines.map((line) => ({
    variantId: line.variantId,
    qty: line.qty,
    fulfilment: line.fulfilment,
    stockTracked: bySlug.get(line.productSlug)!.stockTracked,
  }));

  const subtotalPaise = lines.reduce((sum, l) => sum + l.linePaise, 0);
  /* Per-line GST, already contained within `subtotalPaise` — see
     `taxForLine`. Reported for the invoice, not added again here. */
  const taxPaise = lines.reduce((sum, l) => sum + l.taxPaise, 0);
  /* No discount or delivery-fee engine exists yet: `Order.discountPaise`
     and `Order.deliveryFeePaise` default to zero on the row, so the total
     is exactly the subtotal until a later phase computes real values for
     them. Not `subtotal + tax` — tax is already inside the subtotal, and
     adding it again is the double-charge this module exists to prevent. */
  const totalPaise = subtotalPaise;

  /* Retry on a reference collision rather than pre-checking for one: the
     check-then-insert version is a race that two concurrent orders can
     both pass, and the unique index is the only thing that actually
     decides. P2002 is Prisma's unique-constraint violation.

     A collision on `(userId, idempotencyKey)` is not retried — it is not
     an accident to route around, it is the mechanism working: the
     customer (or their double-clicked button) has already placed this
     exact order, and `readIdempotentOrder` returns what was written for
     it instead. */
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      /* An explicit interactive transaction rather than one nested write,
         because stock now has to be reserved between the order existing
         and its lines being written — see below. Order first, without
         its lines, so `reserveStockForOrder` has an `orderId` to tag
         `InventoryMovement` rows with; lines are written afterward with
         `storeId` already resolved, rather than created bare and updated
         a second time. */
      const created = await db.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            reference: generateReference(REFERENCE_PREFIX),
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
            subtotalPaise,
            taxPaise,
            totalPaise,
            addressId: address.id,
            shipName: input.shipName,
            shipPhone: input.shipPhone,
            shipLine1: address.line1,
            shipLine2: address.line2,
            shipLandmark: address.landmark,
            shipCity: address.city,
            shipState: address.state,
            shipPincode: address.pincode,
          },
          select: {
            id: true,
            reference: true,
            subtotalPaise: true,
            taxPaise: true,
            totalPaise: true,
          },
        });

        /* Throws `InsufficientStockError` or `StoreUnavailableError` on
           the first line that cannot be reserved, which aborts this
           transaction — the order row above rolls back with it, so a
           basket that cannot be fully reserved never becomes a partial
           order. Caught below and translated to `OrderNotPossibleError`. */
        const storeByVariant = await reserveStockForOrder(tx, {
          orderId: order.id,
          address: { lat: address.lat, lng: address.lng },
          lines: stockCheckLines,
        });

        await tx.orderLine.createMany({
          data: lines.map((line) => ({
            ...line,
            orderId: order.id,
            storeId: storeByVariant.get(line.variantId) ?? null,
          })),
        });

        /* Only set when something was actually reserved. A basket with
           nothing stock-tracked in it has nothing for
           `releaseExpiredReservations` to release, and a null column
           says that plainly rather than carrying a deadline for a
           reservation that never existed. */
        const anyReserved = [...storeByVariant.values()].some((v) => v != null);
        if (anyReserved) {
          /* Online and callback orders reserve under different windows —
             see `CALLBACK_RESERVATION_WINDOW_MS` — because a callback has
             no one paying within minutes; it has an expert who has not
             called yet. */
          const windowMs =
            input.paymentMode === "callback"
              ? CALLBACK_RESERVATION_WINDOW_MS
              : RESERVATION_WINDOW_MS;
          await tx.order.update({
            where: { id: order.id },
            data: { reservationExpiresAt: new Date(Date.now() + windowMs) },
          });
        }

        return order;
      });

      return { ...created, quote, idempotent: false, existingPayment: null };
    } catch (error) {
      if (error instanceof InsufficientStockError || error instanceof StoreUnavailableError) {
        throw new OrderNotPossibleError(
          "Some items in this basket are no longer in stock at your delivery address. Please review your basket.",
        );
      }

      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      const target = error.meta?.target as string[] | undefined;

      if (input.idempotencyKey && target?.includes("idempotencyKey")) {
        return readIdempotentOrder(input.userId, input.idempotencyKey, quote);
      }

      /* Only a reference clash is retryable. Any other unique index
         failing means something different is wrong, and spinning five
         times over it would just delay the real error. */
      if (!target?.includes("reference")) throw error;
    }
  }

  throw new Error("Could not allocate an order reference");
}

/**
 * Records that the customer has been handed to the gateway.
 *
 * One row per trip to checkout. Someone who abandons and comes back gets
 * a second gateway order and so a second row, which is what keeps the
 * abandoned attempt on the record rather than overwriting it.
 */
export function recordPaymentAttempt(input: {
  orderId: string;
  providerOrderId: string;
  amountPaise: Paise;
}) {
  return db.payment.create({
    data: {
      orderId: input.orderId,
      providerOrderId: input.providerOrderId,
      amountPaise: input.amountPaise,
    },
    select: { id: true },
  });
}

/** ---- Webhook settlement -------------------------------------------------- */

export type SettlementOutcome =
  /** First delivery of this event; the payment and order were updated. */
  | "recorded"
  /** Already applied. Razorpay retries, and this is the ordinary case. */
  | "duplicate"
  /** No payment row matches — not ours, or a stale test event. */
  | "unknown"
  /** Captured amount did not match the order total. Nothing was changed. */
  | "amount_mismatch";

/**
 * Marks a captured payment paid.
 *
 * Idempotent on `providerPaymentId`, which carries a unique index — the
 * database, not a prior read, is what decides whether an event has been
 * seen. Razorpay retries on any non-2xx response and can deliver the same
 * event more than once even on success, so "have I already handled this"
 * cannot be answered with a `findFirst` and a branch: two retries
 * arriving together would both pass it.
 *
 * The amount is checked before anything moves. A capture for less than
 * the order total is a discrepancy for a person to look at, not a sale to
 * complete, and marking the order paid would hide it.
 */
/**
 * Thrown inside the settlement transaction when another delivery has
 * already claimed this payment. Module-local and never escapes: it exists
 * to roll the transaction back, and the caller turns it into `duplicate`.
 */
class AlreadySettledError extends Error {
  constructor() {
    super("Payment already settled by a concurrent delivery");
    this.name = "AlreadySettledError";
  }
}

export async function settleCapturedPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  method?: string;
}): Promise<SettlementOutcome> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
    select: {
      id: true,
      status: true,
      providerPaymentId: true,
      orderId: true,
      order: { select: { totalPaise: true, status: true } },
    },
  });

  if (!payment) return "unknown";

  if (
    payment.status === "CAPTURED" &&
    payment.providerPaymentId === input.providerPaymentId
  ) {
    return "duplicate";
  }

  if (input.amountPaise !== payment.order.totalPaise) {
    /* Recorded rather than swallowed, so the discrepancy is visible in
       the payments table and not only in a log line that scrolls away. */
    await db.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: input.providerPaymentId,
        method: input.method,
        failureReason: `Captured ${input.amountPaise} paise against an order total of ${payment.order.totalPaise} paise`,
      },
    });
    return "amount_mismatch";
  }

  try {
    /* All three writes or none. An order marked paid whose payment row
       still says CREATED, or the reverse, is the state that makes a
       refund argument unwinnable — and stock committed without the order
       actually being paid (or the reverse: paid with the reservation
       still just sitting there) is the same problem one column over.
       An interactive transaction rather than the array form used
       elsewhere in this file, because `commitStockForOrder` needs to run
       its own reads and a raw `UPDATE` in between — the array form can
       only batch independent writes, it cannot sequence a read against
       one of them.
       Idempotency is enforced by the conditional `updateMany` below, and
       it has to be: the unique index on `providerPaymentId` cannot do it.
       Two concurrent deliveries of the same `payment.captured` target the
       *same* payment row and write the *same* id to it, so there is no
       uniqueness to violate — both would have committed stock, and
       `commitVariantStock` is not idempotent on its own. Its only guard
       is `reservedQty >= qty`, which a *different* customer's live
       reservation satisfies, so the second commit would have deducted
       on-hand twice and eaten that reservation.

       The guarded update is the claim: exactly one delivery can move the
       row out of a non-CAPTURED state, and only the one that does goes on
       to touch stock. The loser throws and rolls back, having changed
       nothing. The unique-index catch below still matters for the
       different case it actually covers — two *distinct* payment rows
       claiming one gateway payment id. */
    await db.$transaction(async (tx) => {
      /* `updateMany` rather than `update`, purely for the `where` guard —
         `update` addresses a row by id and cannot also assert its state.
         A concurrent delivery blocks on the row lock here, then matches
         nothing once the winner commits, and `count` is 0. */
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "CAPTURED" } },
        data: {
          providerPaymentId: input.providerPaymentId,
          status: "CAPTURED",
          method: input.method,
        },
      });

      if (claimed.count === 0) throw new AlreadySettledError();
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: "PAID",
          /* Set once. A retry of the same event must not move the time
             the money actually arrived. */
          paidAt: new Date(),
        },
      });
      await commitStockForOrder(tx, payment.orderId);
    });
    return "recorded";
  } catch (error) {
    /* Both of these mean a concurrent delivery won the race and has
       already done this work. That is success, not failure — returning an
       error would make Razorpay retry something already done. */
    if (error instanceof AlreadySettledError) return "duplicate";
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

/**
 * Records a failed attempt.
 *
 * The order is left PENDING_PAYMENT rather than moved to FAILED: the
 * customer is very often still on the checkout, about to try another
 * method, and an order that has declared itself failed underneath them is
 * one they cannot pay for. FAILED is for a person to set once an attempt
 * is genuinely abandoned.
 */
export async function recordFailedPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  method?: string;
  reason?: string;
}): Promise<SettlementOutcome> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
    select: { id: true, status: true },
  });

  if (!payment) return "unknown";

  /* A capture that has already landed outranks a late failure event.
     Razorpay does not guarantee delivery order, and letting an
     out-of-sequence `payment.failed` overwrite a settled capture would
     mark a paid order unpaid. */
  if (payment.status === "CAPTURED") return "duplicate";

  await db.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: input.providerPaymentId,
      status: "FAILED",
      method: input.method,
      failureReason: input.reason,
    },
  });

  return "recorded";
}
